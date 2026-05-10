import { isLocalhost, normalizeApiBase } from '@/utils/connection';

const DEV_PROXY_PREFIX = '/__dev_proxy__';

export type ChatRole = 'system' | 'user' | 'assistant';

export interface ChatRequestMessage {
  role: ChatRole;
  content: string;
}

export interface ProxyModel {
  id: string;
  name?: string;
  ownedBy?: string;
}

export interface ChatRequestOptions {
  apiBase: string;
  clientApiKey?: string;
  model: string;
  messages: ChatRequestMessage[];
  signal?: AbortSignal;
  onDelta?: (delta: string) => void;
}

export interface ImageGenerationOptions {
  apiBase: string;
  clientApiKey?: string;
  model: string;
  prompt: string;
  size: string;
  count: number;
  signal?: AbortSignal;
}

export interface GeneratedImage {
  url?: string;
  b64Json?: string;
  revisedPrompt?: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const shouldUseDevProxy = (normalizedBase: string): boolean => {
  if (!import.meta.env.DEV || typeof window === 'undefined') {
    return false;
  }

  try {
    const target = new URL(normalizedBase);
    const current = new URL(window.location.origin);
    return isLocalhost(current.hostname) && target.origin !== current.origin;
  } catch {
    return false;
  }
};

const buildProxyUrl = (apiBase: string, path: string): string => {
  const normalized = normalizeApiBase(apiBase);
  if (!normalized) {
    throw new Error('Missing API base URL');
  }
  if (shouldUseDevProxy(normalized)) {
    return `${DEV_PROXY_PREFIX}/${encodeURIComponent(normalized)}${path}`;
  }
  return `${normalized}${path}`;
};

const buildHeaders = (clientApiKey?: string): HeadersInit => {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  const trimmedKey = String(clientApiKey ?? '').trim();
  if (trimmedKey) {
    headers.Authorization = `Bearer ${trimmedKey}`;
  }
  return headers;
};

const readErrorMessage = async (response: Response): Promise<string> => {
  const fallback = `${response.status} ${response.statusText}`.trim();
  try {
    const payload = (await response.json()) as unknown;
    if (isRecord(payload)) {
      const error = payload.error;
      if (typeof error === 'string') return error;
      if (isRecord(error) && typeof error.message === 'string') return error.message;
      if (typeof payload.message === 'string') return payload.message;
    }
  } catch {
    try {
      const text = await response.text();
      if (text.trim()) return text.trim();
    } catch {
      // use fallback
    }
  }
  return fallback || 'Request failed';
};

const normalizeModels = (payload: unknown): ProxyModel[] => {
  const rawItems = isRecord(payload)
    ? Array.isArray(payload.data)
      ? payload.data
      : Array.isArray(payload.models)
        ? payload.models
        : []
    : Array.isArray(payload)
      ? payload
      : [];

  const seen = new Set<string>();
  const models: ProxyModel[] = [];

  rawItems.forEach((item) => {
    const record = isRecord(item) ? item : null;
    const id = String(record?.id ?? record?.name ?? item ?? '').trim();
    if (!id || seen.has(id)) return;
    seen.add(id);
    models.push({
      id,
      name: typeof record?.name === 'string' ? record.name : undefined,
      ownedBy: typeof record?.owned_by === 'string' ? record.owned_by : undefined,
    });
  });

  return models.sort((a, b) => a.id.localeCompare(b.id));
};

const extractChatDelta = (payload: unknown): string => {
  if (!isRecord(payload)) return '';
  const choices = Array.isArray(payload.choices) ? payload.choices : [];
  const deltas = choices
    .map((choice) => {
      if (!isRecord(choice)) return '';
      const delta = choice.delta;
      const message = choice.message;
      if (isRecord(delta) && typeof delta.content === 'string') return delta.content;
      if (isRecord(message) && typeof message.content === 'string') return message.content;
      return '';
    })
    .join('');

  if (deltas) return deltas;
  if (typeof payload.output_text === 'string') return payload.output_text;
  return '';
};

const processSSEFrame = (frame: string, onDelta?: (delta: string) => void): string => {
  const dataLines = frame
    .split(/\r?\n/)
    .filter((line) => line.trimStart().startsWith('data:'))
    .map((line) => line.replace(/^\s*data:\s?/, ''));
  if (dataLines.length === 0) return '';

  const data = dataLines.join('\n').trim();
  if (!data || data === '[DONE]') return '';

  const parsed = JSON.parse(data) as unknown;
  const delta = extractChatDelta(parsed);
  if (delta) {
    onDelta?.(delta);
  }
  return delta;
};

export const chatApi = {
  async listModels(apiBase: string, clientApiKey?: string): Promise<ProxyModel[]> {
    const response = await fetch(buildProxyUrl(apiBase, '/v1/models'), {
      method: 'GET',
      headers: buildHeaders(clientApiKey),
    });
    if (!response.ok) {
      throw new Error(await readErrorMessage(response));
    }
    return normalizeModels((await response.json()) as unknown);
  },

  async streamChat(options: ChatRequestOptions): Promise<string> {
    const response = await fetch(buildProxyUrl(options.apiBase, '/v1/chat/completions'), {
      method: 'POST',
      headers: buildHeaders(options.clientApiKey),
      body: JSON.stringify({
        model: options.model,
        messages: options.messages,
        stream: true,
      }),
      signal: options.signal,
    });

    if (!response.ok) {
      throw new Error(await readErrorMessage(response));
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/event-stream')) {
      const payload = (await response.json()) as unknown;
      const content = extractChatDelta(payload);
      if (content) options.onDelta?.(content);
      return content;
    }

    if (!response.body) {
      return '';
    }

    const decoder = new TextDecoder();
    const reader = response.body.getReader();
    let buffer = '';
    let finalText = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let frameEnd = buffer.search(/\r?\n\r?\n/);
      while (frameEnd >= 0) {
        const delimiter = buffer.match(/\r?\n\r?\n/)?.[0] ?? '\n\n';
        const frame = buffer.slice(0, frameEnd);
        buffer = buffer.slice(frameEnd + delimiter.length);
        try {
          finalText += processSSEFrame(frame, options.onDelta);
        } catch {
          // Skip malformed keepalive or proxy notice frames.
        }
        frameEnd = buffer.search(/\r?\n\r?\n/);
      }
    }

    const tail = buffer.trim();
    if (tail) {
      try {
        finalText += processSSEFrame(tail, options.onDelta);
      } catch {
        // ignore trailing partial frame
      }
    }

    return finalText;
  },

  async generateImages(options: ImageGenerationOptions): Promise<GeneratedImage[]> {
    const response = await fetch(buildProxyUrl(options.apiBase, '/v1/images/generations'), {
      method: 'POST',
      headers: buildHeaders(options.clientApiKey),
      body: JSON.stringify({
        model: options.model,
        prompt: options.prompt,
        n: options.count,
        size: options.size,
        response_format: 'b64_json',
      }),
      signal: options.signal,
    });

    if (!response.ok) {
      throw new Error(await readErrorMessage(response));
    }

    const payload = (await response.json()) as unknown;
    const data = isRecord(payload) && Array.isArray(payload.data) ? payload.data : [];
    const images: GeneratedImage[] = [];
    data.forEach((item) => {
      if (!isRecord(item)) return;
      const image: GeneratedImage = {
          url: typeof item.url === 'string' ? item.url : undefined,
          b64Json: typeof item.b64_json === 'string' ? item.b64_json : undefined,
          revisedPrompt:
            typeof item.revised_prompt === 'string' ? item.revised_prompt : undefined,
      };
      if (image.url || image.b64Json) {
        images.push(image);
      }
    });
    return images;
  },
};
