/**
 * Mock gateway for visual verification only.
 * Serves the /v0/management API surface with deterministic fixture data so
 * every admin screen renders realistic content. Not a test fixture; run with
 * `node scripts/mock-gateway.mjs` while `npm run dev` is up.
 */
import http from 'node:http';

const PORT = Number(process.env.MOCK_GATEWAY_PORT || 8317);

const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'access-control-allow-headers': 'content-type, authorization, x-cpa-management-key, x-cpa-management-session, x-cpa-management-session-status',
  'vary': 'origin',
};

/** Config section selection: `/v0/management/<section>` maps to `sections` keys. */
const SECTIONS = {
  debug: { debug: true },
  'proxy-url': { 'proxy-url': 'http://127.0.0.1:8317' },
  'request-retry': { 'request-retry': 3 },
  'quota-exceeded': {
    'quota-exceeded': { 'switch-project': true, 'switch-preview-model': false },
  },
  'usage-statistics-enabled': { 'usage-statistics-enabled': true },
  'usage-statistics-persist': { 'usage-statistics-persist': true },
  'usage-statistics-file': { 'usage-statistics-file': '/var/log/toka/usage.jsonl' },
  'usage-statistics-persist-interval': { 'usage-statistics-persist-interval': 30 },
  'request-log': { 'request-log': true },
  'logging-to-file': { 'logging-to-file': true },
  'logs-max-total-size-mb': { 'logs-max-total-size-mb': 256 },
  'ws-auth': { 'ws-auth': true },
  'force-model-prefix': { 'force-model-prefix': true },
  'routing/strategy': { strategy: 'priority-first' },
  'api-keys': {
    'api-keys': [
      { 'api-key': 'tk-live-9f2c81a2d84e40b6b0a1', note: 'CI runners', disabled: false },
      { 'api-key': 'tk-live-4b7e11c9a3f24d8e8f01', note: 'Preview builds', disabled: false },
      { 'api-key': 'tk-staging-7d18ea31b2c99f4c6b77', note: 'Staging bots', disabled: true },
      { 'api-key': 'tk-live-05c37fe2a9b1448d92ba', note: 'Internal tools', disabled: false },
    ],
  },
  'codex-api-key': {
    'codex-api-key': [
      { 'api-key': 'sk-cdx-live-8e2f4a1c7d4b90e3f6a2', priority: 0 },
      { 'api-key': 'sk-cdx-live-b34d1527a6c84e1f9d08', priority: 1 },
    ],
  },
  'claude-api-key': {
    'claude-api-key': [
      { 'api-key': 'sk-ant-live-71c2f9e3d8b6450a2c91', priority: 0 },
      { 'api-key': 'sk-ant-live-2a5e8f4c19b37d6b80de', priority: 1 },
    ],
  },
  'gemini-api-key': {
    'gemini-api-key': [
      { 'api-key': 'AIzaSyMockGeminiLiveKey0f2f9c81a2d84e40', priority: 0 },
      { 'api-key': 'AIzaSyMockGeminiStaging2a5e8f4c19b37d', priority: 1 },
    ],
  },
  'openai-compatibility': {
    'openai-compatibility': [
      {
        name: 'minimax',
        'base-url': 'https://api.minimax.chat/v1',
        'api-key': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.mock-minimax',
        'models': ['MiniMax-M1.4', 'MiniMax-Text-01'],
        'additional-models': ['abab6.5s-chat', 'abab7-chat-preview'],
        'priority': 0,
      },
      {
        name: 'deepseek',
        'base-url': 'https://api.deepseek.com/v1',
        'api-key': 'sk-ds-live-0f3b9c27e8a15d4c6b09',
        'models': ['deepseek-chat', 'deepseek-reasoner'],
        'additional-models': [],
        'priority': 1,
      },
      {
        name: 'zhipu',
        'base-url': 'https://open.bigmodel.cn/api/paas/v4',
        'api-key': 'sk-zhipu-live-91d4f0b6c3a27e8d5f14',
        'models': ['glm-4.5', 'glm-4.5-air'],
        'additional-models': ['glm-4-flash', 'glm-4-plus'],
        'priority': 2,
      },
    ],
  },
  'oauth-excluded-models': {
    'oauth-excluded-models': {
      codex: ['gpt-3.5-turbo', 'gpt-4-turbo-preview'],
      anthropic: ['claude-3-haiku-20240307'],
    },
  },
};

const FULL_CONFIG = Object.keys(SECTIONS).reduce((acc, key) => {
  Object.assign(acc, SECTIONS[key]);
  return acc;
}, {});

const MODELS_SYSTEM = [
  { id: 'claude-sonnet-4.5', name: 'claude-sonnet-4.5', family: 'claude' },
  { id: 'claude-opus-4.1', name: 'claude-opus-4.1', family: 'claude' },
  { id: 'gpt-5.2', name: 'gpt-5.2', family: 'gpt' },
  { id: 'gpt-4.1-mini', name: 'gpt-4.1-mini', family: 'gpt' },
  { id: 'gemini-2.5-pro', name: 'gemini-2.5-pro', family: 'gemini' },
  { id: 'deepseek-v3.2', name: 'deepseek-v3.2', family: 'deepseek' },
  { id: 'minimax-m1.4', name: 'MiniMax-M1.4', family: 'minimax' },
];

const AUTH_FILES = [
  {
    name: 'codex-2f9c81a2.json',
    provider: 'codex',
    type: 'api-key',
    accounts: 1,
    disabled: false,
    size: 128,
    updated: '2026-08-20T09:14:22.000Z',
    validity: 'valid',
  },
  {
    name: 'anthropic-multiuser.json',
    provider: 'anthropic',
    type: 'refresh-token',
    accounts: 4,
    disabled: false,
    size: 512,
    updated: '2026-08-22T15:41:09.000Z',
    validity: 'valid',
  },
  {
    name: 'codex-7d18ea31.json',
    provider: 'codex',
    type: 'api-key',
    accounts: 2,
    disabled: true,
    size: 256,
    updated: '2026-07-30T11:02:47.000Z',
    validity: 'expired',
  },
  {
    name: 'kimi-oauth-preview.json',
    provider: 'kimi',
    type: 'oauth',
    accounts: 3,
    disabled: false,
    size: 384,
    updated: '2026-08-24T07:58:33.000Z',
    validity: 'valid',
  },
  {
    name: 'gemini-live.json',
    provider: 'gemini',
    type: 'api-key',
    accounts: 1,
    disabled: false,
    size: 96,
    updated: '2026-08-18T13:26:51.000Z',
    validity: 'valid',
  },
  {
    name: 'deepseek-main.json',
    provider: 'deepseek',
    type: 'api-key',
    accounts: 2,
    disabled: false,
    size: 192,
    updated: '2026-08-25T02:09:14.000Z',
    validity: 'valid',
  },
];

const REQUEST_LOGS = (() => {
  const models = ['claude-sonnet-4.5', 'gpt-5.2', 'gemini-2.5-pro', 'deepseek-v3.2', 'MiniMax-M1.4'];
  const files = AUTH_FILES.map((f) => f.name);
  const statuses = ['success', 'error', 'timeout'];
  const now = Date.now();
  return Array.from({ length: 48 }, (_, i) => {
    const o = i * 37 + 13;
    return {
      id: `req_${(100000 + i * 7919).toString(36)}`,
      timestamp: new Date(now - i * 143 * 1000).toISOString(),
      model: models[i % models.length],
      provider: files[i % files.length],
      status: statuses[i % 7 === 6 ? 2 : i % 4 === 3 ? 1 : 0],
      latency_ms: 380 + ((i * 733) % 2400),
      input_tokens: 420 + ((i * 937) % 6800),
      output_tokens: 90 + ((i * 523) % 2200),
      cost_usd: Math.round(((0.4 + ((i * 83) % 9000) / 1000) * 100) + 0.5) / 100,
      trace_id: (o >>> 0).toString(16).padStart(24, '0'),
      finish_reason: i % 9 === 8 ? 'length' : 'stop',
    };
  });
})();

const USAGE_AGGREGATED = {
  window: '7d',
  totals: {
    requests: 12847,
    input_tokens: 482913600,
    output_tokens: 92410330,
    cost_usd: 1246.82,
    success_rate: 0.971,
  },
  by_model: [
    { model: 'claude-sonnet-4.5', requests: 4290, input_tokens: 141200000, output_tokens: 38400000, cost_usd: 518.4, success_rate: 0.982 },
    { model: 'gpt-5.2', requests: 3611, input_tokens: 188400000, output_tokens: 21400000, cost_usd: 402.18, success_rate: 0.964 },
    { model: 'gemini-2.5-pro', requests: 2240, input_tokens: 89200000, output_tokens: 17100000, cost_usd: 143.92, success_rate: 0.977 },
    { model: 'deepseek-v3.2', requests: 1871, input_tokens: 51000000, output_tokens: 14200000, cost_usd: 71.28, success_rate: 0.953 },
    { model: 'MiniMax-M1.4', requests: 835, input_tokens: 13013600, output_tokens: 1170000, cost_usd: 111.04, success_rate: 0.981 },
  ],
  by_credential: [
    { credential: 'codex-2f9c81a2.json', requests: 4392, cost_usd: 402.18, success_rate: 0.971 },
    { credential: 'anthropic-multiuser.json', requests: 3611, cost_usd: 518.4, success_rate: 0.982 },
    { credential: 'kimi-oauth-preview.json', requests: 2240, cost_usd: 113.6, success_rate: 0.944 },
    { credential: 'gemini-live.json', requests: 1871, cost_usd: 143.92, success_rate: 0.977 },
  ],
};

const USAGE_DETAILS = (() => {
  const now = Date.now();
  return {
    usage: Array.from({ length: 144 }, (_, i) => ({
      timestamp: new Date(now - i * 3600 * 1000).toISOString(),
      model: ['claude-sonnet-4.5', 'gpt-5.2', 'gemini-2.5-pro', 'deepseek-v3.2'][i % 4],
      input_tokens: 1200 + ((i * 977) % 24000),
      output_tokens: 240 + ((i * 613) % 9000),
      cost_usd: Math.round(((0.2 + ((i * 47) % 1600) / 100) * 100) + 0.5) / 100,
      requests: 1 + (i % 3),
    })),
  };
})();

const LOG_LINES = [
  '[INFO] management server listening on 0.0.0.0:8317',
  '[INFO] config reloaded (pid 4823)',
  '[WARN] upstream api.anthropic.com returned 429 for credential anthropic-multiuser.json',
  '[INFO] oauth callback accepted for provider=codex state=a1b2c3',
  '[ERROR] request req_1h6x failed after 3 retries: connection reset by peer',
  '[INFO] usage statistics flushed to /var/log/toka/usage.jsonl (12847 records)',
  '[INFO] route strategy switched to priority-first',
];

const DEROUTER_CONTAINERS = [
  { id: 'ctr-8f2', name: 'us-east-core', region: 'us-east-1', status: 'running', tasks: 12, accounts: 4, proxy: 'toka-ctr-8f2:8443' },
  { id: 'ctr-3a9', name: 'eu-central-2', region: 'eu-central-1', status: 'running', tasks: 8, accounts: 3, proxy: 'toka-ctr-3a9:8443' },
  { id: 'ctr-5d1', name: 'ap-southeast-1', region: 'ap-southeast-1', status: 'degraded', tasks: 5, accounts: 2, proxy: 'toka-ctr-5d1:8443' },
];

const DEROUTER_EARNINGS = {
  total: 12847,
  today: 214,
  week: 12847,
  month: 52810,
  hourly: Array.from({ length: 24 }, (_, i) => ({
    hour: i,
    requests: 240 + ((i * 137) % 520),
    revenue_usd: Math.round(((1.2 + ((i * 31) % 200)) * 100) + 0.5) / 100,
  })),
};

function json(res, data, status = 200) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'x-cpa-version': '0.18.3',
    'x-cpa-build-date': '2026-08-20T00:00:00.000Z',
    ...CORS_HEADERS,
  });
  res.end(body);
}

function text(res, data) {
  const body = Buffer.from(data, 'utf-8');
  res.writeHead(200, {
    'content-type': 'text/plain; charset=utf-8',
    'content-length': body.length,
    ...CORS_HEADERS,
  });
  res.end(body);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const p = url.pathname;
  const method = req.method;

  if (method === 'OPTIONS') {
    res.writeHead(204, CORS_HEADERS);
    res.end();
    return;
  }

  // Accept any bearer key; the management UI just needs a 200.
  if (!/^\/v0\/management/.test(p)) {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('not found');
    return;
  }

  let raw = '';
  req.on('data', (c) => (raw += c));
  req.on('end', () => {
    let body = null;
    try {
      body = raw ? JSON.parse(raw) : null;
    } catch {
      body = { raw };
    }

    const rest = p.replace(/^\/v0\/management/, '');
    switch (rest) {
      case '/config':
        return json(res, FULL_CONFIG);
      case '/config.yaml': {
        const yaml = [
          'http:',
          '  port: 8317',
          'management:',
          '  api-port: 8317',
          '  auth:',
          '    directory: ~/.toka/auth',
          'providers:',
          '  codex:',
          '    api-keys:',
          '      - api-key: sk-cdx-live-8e2f4a1c7d4b90e3f6a2',
          '        priority: 0',
          '',
        ].join('\n');
        return text(res, yaml);
      }
      case '/api-keys':
        if (method === 'GET') return json(res, SECTIONS['api-keys']);
        return json(res, { ok: true });
      case '/codex-api-key':
        if (method === 'GET') return json(res, SECTIONS['codex-api-key']);
        return json(res, { ok: true });
      case '/gemini-api-key':
        if (method === 'GET') return json(res, SECTIONS['gemini-api-key']);
        return json(res, { ok: true });
      case '/claude-api-key':
        if (method === 'GET') return json(res, SECTIONS['claude-api-key']);
        return json(res, { ok: true });
      case '/openai-compatibility':
        return json(res, SECTIONS['openai-compatibility']);
      case '/oauth-excluded-models':
        if (method === 'GET') return json(res, SECTIONS['oauth-excluded-models']);
        return json(res, { ok: true });
      case '/oauth-model-alias':
        if (method === 'GET') return json(res, {});
        return json(res, { ok: true });
      case '/auth-files':
        if (method === 'GET') {
          const page = Number(url.searchParams.get('page') || 1);
          const pageSize = Number(url.searchParams.get('page_size') || 20);
          const start = (page - 1) * pageSize;
          return json(res, {
            files: AUTH_FILES.slice(start, start + pageSize),
            total: AUTH_FILES.length,
            page,
            page_size: pageSize,
          });
        }
        return json(res, {
          ok: true,
          files: [],
          failed: [],
          deleted: 0,
        });
      case '/auth-files/models': {
        const name = url.searchParams.get('name') || '';
        const idx = AUTH_FILES.findIndex((f) => f.name === name);
        return json(res, {
          models: MODELS_SYSTEM.slice(idx === -1 ? 0 : idx, (idx === -1 ? 0 : idx) + 3),
        });
      }
      case '/auth-files/status':
        return json(res, { ok: true });
      case '/auth-files/fields':
        return json(res, { ok: true });
      case '/auth-files/promotion-eligibility':
        return json(res, { eligible: true });
      case '/auth-files/codex-usage':
        return json(res, {
          limit: 3750,
          used: 2840,
          reset_timestamp: new Date(Date.now() + 3.1e6).toISOString(),
        });
      case '/auth-files/codex-rate-limit-reset-credits':
        return json(res, { reset: true });
      case '/logs':
        return json(res, {
          lines: Array.from(
            { length: 40 },
            (_, i) => `${new Date(Date.now() - i * 82000).toISOString()} ${LOG_LINES[i % LOG_LINES.length]}`
          ),
          'line-count': 3200,
          'latest-timestamp': Date.now(),
        });
      case '/request-error-logs':
        return json(res, {
          files: [
            { name: 'error-2026-08-24.1.log', size: 48231, modified: Date.now() - 3600000 },
            { name: 'error-2026-08-23.1.log', size: 18120, modified: Date.now() - 86400000 },
          ],
        });
      case '/usage':
        return json(res, {
          requests: 12847,
          tokens_in: 482913600,
          tokens_out: 92410330,
          cost: 1246.82,
          success_rate: 0.971,
        });
      case '/usage/aggregated':
        return json(res, USAGE_AGGREGATED);
      case '/usage/details':
        return json(res, USAGE_DETAILS);
      case '/usage/export':
      case '/usage/export/details':
        return json(res, USAGE_DETAILS);
      case '/usage/import':
        return json(res, { ok: true, imported: 0, failed: 0 });
      case '/model-prices':
        return json(res, {
          'model-prices': {
            'claude-sonnet-4.5': { input: 3, output: 15 },
            'gpt-5.2': { input: 1.25, output: 10 },
            'gemini-2.5-pro': { input: 1.25, output: 10 },
          },
        });
      case '/derouter/containers':
        return json(res, { containers: DEROUTER_CONTAINERS });
      case '/derouter/earnings':
        return json(res, DEROUTER_EARNINGS);
      case '/latest-version':
        return json(res, { 'latest-version': '0.18.3' });
      case '/get-auth-status':
        return json(res, { status: 'wait' });
      case '/codex-auth-url':
      case '/anthropic-auth-url':
      case '/kimi-auth-url':
        return json(res, { url: 'https://example.com/oauth/start?state=mock', state: 'mock-state-123' });
      case '/oauth-callback':
        return json(res, { provider: body?.provider, status: 'ok' });
      case '/api-call':
        return json(res, { id: 'req_mock', ok: body?.ok ?? true, latency_ms: 211 });
      case '/debug':
      case '/proxy-url':
      case '/request-retry':
      case '/usage-statistics-enabled':
      case '/usage-statistics-persist':
      case '/usage-statistics-file':
      case '/usage-statistics-persist-interval':
      case '/request-log':
      case '/logging-to-file':
      case '/logs-max-total-size-mb':
      case '/ws-auth':
      case '/force-model-prefix':
      case '/routing/strategy':
        return json(res, { ok: true });
      case '/request-log-by-id/':
        return json(res, {});
      default: {
        if (p.startsWith('/v0/management/request-log-by-id/')) return json(res, {});
        res.writeHead(404, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: `mock: no route ${method} ${rest}` }));
      }
    }
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`mock gateway on http://127.0.0.1:${PORT}`);
});
