import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select, type SelectOption } from '@/components/ui/Select';
import {
  IconBot,
  IconCopy,
  IconDownload,
  IconImage,
  IconRefreshCw,
  IconSendHorizontal,
  IconSquare,
} from '@/components/ui/icons';
import { chatApi, type ChatRequestMessage, type GeneratedImage, type ProxyModel } from '@/services/api';
import { useAuthStore, useConfigStore, useNotificationStore } from '@/stores';
import styles from './ChatPage.module.scss';

type ConversationMessage = ChatRequestMessage & {
  id: string;
  pending?: boolean;
  error?: boolean;
};

const NO_CLIENT_KEY = '__none__';
const MANUAL_CLIENT_KEY = '__manual__';
const DEFAULT_IMAGE_SIZE = '1024x1024';

const imageSizes: SelectOption[] = [
  { value: '1024x1024', label: '1024 x 1024' },
  { value: '1024x1536', label: '1024 x 1536' },
  { value: '1536x1024', label: '1536 x 1024' },
  { value: '512x512', label: '512 x 512' },
];

const imageCounts: SelectOption[] = [
  { value: '1', label: '1' },
  { value: '2', label: '2' },
  { value: '4', label: '4' },
];

const createMessageId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

const maskKey = (key: string) => {
  const trimmed = key.trim();
  if (!trimmed) return '';
  if (trimmed.length <= 12) return `${trimmed.slice(0, 4)}...`;
  return `${trimmed.slice(0, 7)}...${trimmed.slice(-4)}`;
};

const modelToOption = (model: ProxyModel): SelectOption => ({
  value: model.id,
  label: model.id,
});

const resolveImageSrc = (image: GeneratedImage) => {
  if (image.url) return image.url;
  if (image.b64Json) return `data:image/png;base64,${image.b64Json}`;
  return '';
};

export function ChatPage() {
  const { t } = useTranslation();
  const { showNotification } = useNotificationStore();
  const apiBase = useAuthStore((state) => state.apiBase);
  const config = useConfigStore((state) => state.config);

  const configuredKeys = config?.apiKeys ?? [];
  const [clientKeyMode, setClientKeyMode] = useState(NO_CLIENT_KEY);
  const [manualClientKey, setManualClientKey] = useState('');
  const [models, setModels] = useState<ProxyModel[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [selectedModel, setSelectedModel] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [imageModel, setImageModel] = useState('');
  const [imagePrompt, setImagePrompt] = useState('');
  const [imageSize, setImageSize] = useState(DEFAULT_IMAGE_SIZE);
  const [imageCount, setImageCount] = useState('1');
  const [imageLoading, setImageLoading] = useState(false);
  const [images, setImages] = useState<GeneratedImage[]>([]);
  const chatAbortRef = useRef<AbortController | null>(null);
  const imageAbortRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const effectiveClientKey = useMemo(() => {
    if (clientKeyMode === MANUAL_CLIENT_KEY) return manualClientKey.trim();
    if (clientKeyMode === NO_CLIENT_KEY) return '';
    return clientKeyMode;
  }, [clientKeyMode, manualClientKey]);

  const clientKeyOptions = useMemo<SelectOption[]>(() => {
    const configured = configuredKeys.map((entry, index) => ({
      value: entry.apiKey,
      label: `${t('chat.client_key_configured')} ${index + 1} · ${maskKey(entry.apiKey)}`,
    }));
    return [
      ...configured,
      { value: NO_CLIENT_KEY, label: t('chat.client_key_none') },
      { value: MANUAL_CLIENT_KEY, label: t('chat.client_key_manual') },
    ];
  }, [configuredKeys, t]);

  const modelOptions = useMemo<SelectOption[]>(() => models.map(modelToOption), [models]);

  useEffect(() => {
    if (configuredKeys.length > 0 && clientKeyMode === NO_CLIENT_KEY) {
      setClientKeyMode(configuredKeys[0].apiKey);
    }
  }, [clientKeyMode, configuredKeys]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: 'end' });
  }, [messages]);

  const loadModels = async () => {
    if (!apiBase) return;
    setModelsLoading(true);
    try {
      const nextModels = await chatApi.listModels(apiBase, effectiveClientKey);
      setModels(nextModels);
      const firstModel = nextModels[0]?.id ?? '';
      const firstImageModel =
        nextModels.find((model) => /(?:image|dall|gpt-image|imagen)/i.test(model.id))?.id ??
        firstModel;
      setSelectedModel((current) => current || firstModel);
      setImageModel((current) => current || firstImageModel);
    } catch (error) {
      const message = error instanceof Error ? error.message : t('common.unknown_error');
      showNotification(`${t('chat.models_load_failed')}: ${message}`, 'error');
    } finally {
      setModelsLoading(false);
    }
  };

  useEffect(() => {
    void loadModels();
  }, [apiBase, effectiveClientKey]);

  const apiMessages = (nextUserMessage: ConversationMessage): ChatRequestMessage[] => {
    const prepared: ChatRequestMessage[] = [];
    const trimmedSystem = systemPrompt.trim();
    if (trimmedSystem) {
      prepared.push({ role: 'system', content: trimmedSystem });
    }
    messages
      .filter((message) => !message.pending && !message.error)
      .forEach((message) => {
        prepared.push({ role: message.role, content: message.content });
      });
    prepared.push({ role: 'user', content: nextUserMessage.content });
    return prepared;
  };

  const handleChatSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const trimmedInput = input.trim();
    if (!trimmedInput || !selectedModel || chatLoading) return;

    const userMessage: ConversationMessage = {
      id: createMessageId(),
      role: 'user',
      content: trimmedInput,
    };
    const assistantMessage: ConversationMessage = {
      id: createMessageId(),
      role: 'assistant',
      content: '',
      pending: true,
    };
    setMessages((current) => [...current, userMessage, assistantMessage]);
    setInput('');
    setChatLoading(true);

    const controller = new AbortController();
    chatAbortRef.current = controller;

    try {
      await chatApi.streamChat({
        apiBase,
        clientApiKey: effectiveClientKey,
        model: selectedModel,
        messages: apiMessages(userMessage),
        signal: controller.signal,
        onDelta: (delta) => {
          setMessages((current) =>
            current.map((message) =>
              message.id === assistantMessage.id
                ? { ...message, content: `${message.content}${delta}` }
                : message
            )
          );
        },
      });
      setMessages((current) =>
        current.map((message) =>
          message.id === assistantMessage.id ? { ...message, pending: false } : message
        )
      );
    } catch (error) {
      if (controller.signal.aborted) {
        setMessages((current) =>
          current.map((message) =>
            message.id === assistantMessage.id ? { ...message, pending: false } : message
          )
        );
        return;
      }
      const message = error instanceof Error ? error.message : t('common.unknown_error');
      setMessages((current) =>
        current.map((item) =>
          item.id === assistantMessage.id
            ? { ...item, content: message, pending: false, error: true }
            : item
        )
      );
      showNotification(`${t('chat.send_failed')}: ${message}`, 'error');
    } finally {
      setChatLoading(false);
      chatAbortRef.current = null;
    }
  };

  const stopChat = () => {
    chatAbortRef.current?.abort();
  };

  const clearConversation = () => {
    if (chatLoading) stopChat();
    setMessages([]);
  };

  const copyMessage = async (content: string) => {
    await navigator.clipboard.writeText(content);
    showNotification(t('chat.copied'), 'success');
  };

  const handleImageSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const trimmedPrompt = imagePrompt.trim();
    if (!trimmedPrompt || !imageModel || imageLoading) return;

    const controller = new AbortController();
    imageAbortRef.current = controller;
    setImageLoading(true);

    try {
      const nextImages = await chatApi.generateImages({
        apiBase,
        clientApiKey: effectiveClientKey,
        model: imageModel,
        prompt: trimmedPrompt,
        size: imageSize,
        count: Number(imageCount) || 1,
        signal: controller.signal,
      });
      setImages(nextImages);
      if (nextImages.length === 0) {
        showNotification(t('chat.image_empty'), 'warning');
      }
    } catch (error) {
      if (controller.signal.aborted) return;
      const message = error instanceof Error ? error.message : t('common.unknown_error');
      showNotification(`${t('chat.image_failed')}: ${message}`, 'error');
    } finally {
      setImageLoading(false);
      imageAbortRef.current = null;
    }
  };

  const downloadImage = (image: GeneratedImage, index: number) => {
    const href = resolveImageSrc(image);
    if (!href) return;
    const link = document.createElement('a');
    link.href = href;
    link.download = `generated-image-${index + 1}.png`;
    link.click();
  };

  return (
    <div className={styles.page}>
      <section className={styles.header}>
        <div>
          <div className={styles.eyebrow}>{t('chat.eyebrow')}</div>
          <h1 className={styles.title}>{t('chat.title')}</h1>
        </div>
        <Button variant="secondary" size="sm" onClick={loadModels} loading={modelsLoading}>
          <IconRefreshCw size={16} />
          {t('chat.refresh_models')}
        </Button>
      </section>

      <section className={styles.toolbar}>
        <div className={styles.fieldGroup}>
          <span className={styles.label}>{t('chat.client_key')}</span>
          <Select value={clientKeyMode} options={clientKeyOptions} onChange={setClientKeyMode} />
        </div>
        {clientKeyMode === MANUAL_CLIENT_KEY && (
          <Input
            label={t('chat.manual_client_key')}
            value={manualClientKey}
            onChange={(event) => setManualClientKey(event.target.value)}
            placeholder="sk-..."
            type="password"
          />
        )}
      </section>

      <div className={styles.workspace}>
        <section className={styles.chatPanel}>
          <div className={styles.panelHeader}>
            <div className={styles.panelTitle}>
              <IconBot size={18} />
              <span>{t('chat.conversation')}</span>
            </div>
            <Button variant="ghost" size="sm" onClick={clearConversation} disabled={!messages.length}>
              {t('chat.clear')}
            </Button>
          </div>

          <div className={styles.modelRow}>
            <div className={styles.fieldGroup}>
              <span className={styles.label}>{t('chat.model')}</span>
              <Select
                value={selectedModel}
                options={modelOptions}
                onChange={setSelectedModel}
                placeholder={modelsLoading ? t('common.loading') : t('chat.select_model')}
                disabled={modelsLoading || modelOptions.length === 0}
              />
            </div>
          </div>

          <Input
            label={t('chat.system_prompt')}
            value={systemPrompt}
            onChange={(event) => setSystemPrompt(event.target.value)}
            placeholder={t('chat.system_prompt_placeholder')}
          />

          <div className={styles.messages}>
            {messages.length === 0 ? (
              <div className={styles.emptyState}>{t('chat.empty_conversation')}</div>
            ) : (
              messages.map((message) => (
                <article
                  key={message.id}
                  className={`${styles.message} ${styles[message.role]} ${message.error ? styles.error : ''}`}
                >
                  <div className={styles.messageMeta}>
                    <span>{message.role === 'user' ? t('chat.you') : t('chat.assistant')}</span>
                    {message.pending && <span>{t('chat.streaming')}</span>}
                  </div>
                  <div className={styles.messageContent}>{message.content || t('chat.waiting')}</div>
                  {message.content && !message.pending ? (
                    <button
                      type="button"
                      className={styles.messageAction}
                      onClick={() => void copyMessage(message.content)}
                      aria-label={t('common.copy')}
                    >
                      <IconCopy size={14} />
                    </button>
                  ) : null}
                </article>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          <form className={styles.composer} onSubmit={handleChatSubmit}>
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder={t('chat.input_placeholder')}
              rows={3}
              disabled={chatLoading}
            />
            <div className={styles.composerActions}>
              {chatLoading ? (
                <Button type="button" variant="secondary" onClick={stopChat}>
                  <IconSquare size={16} />
                  {t('chat.stop')}
                </Button>
              ) : (
                <Button type="submit" disabled={!input.trim() || !selectedModel}>
                  <IconSendHorizontal size={16} />
                  {t('chat.send')}
                </Button>
              )}
            </div>
          </form>
        </section>

        <section className={styles.imagePanel}>
          <div className={styles.panelHeader}>
            <div className={styles.panelTitle}>
              <IconImage size={18} />
              <span>{t('chat.image_generation')}</span>
            </div>
          </div>

          <form className={styles.imageForm} onSubmit={handleImageSubmit}>
            <div className={styles.fieldGroup}>
              <span className={styles.label}>{t('chat.image_model')}</span>
              <Select
                value={imageModel}
                options={modelOptions}
                onChange={setImageModel}
                placeholder={modelsLoading ? t('common.loading') : t('chat.select_model')}
                disabled={modelsLoading || modelOptions.length === 0}
              />
            </div>
            <label className={styles.textareaField}>
              <span className={styles.label}>{t('chat.image_prompt')}</span>
              <textarea
                value={imagePrompt}
                onChange={(event) => setImagePrompt(event.target.value)}
                placeholder={t('chat.image_prompt_placeholder')}
                rows={5}
                disabled={imageLoading}
              />
            </label>
            <div className={styles.imageControls}>
              <div className={styles.fieldGroup}>
                <span className={styles.label}>{t('chat.image_size')}</span>
                <Select value={imageSize} options={imageSizes} onChange={setImageSize} />
              </div>
              <div className={styles.fieldGroup}>
                <span className={styles.label}>{t('chat.image_count')}</span>
                <Select value={imageCount} options={imageCounts} onChange={setImageCount} />
              </div>
            </div>
            <Button type="submit" fullWidth loading={imageLoading} disabled={!imagePrompt.trim() || !imageModel}>
              <IconImage size={16} />
              {t('chat.generate_image')}
            </Button>
          </form>

          <div className={styles.imageResults}>
            {images.length === 0 ? (
              <div className={styles.emptyState}>{t('chat.empty_images')}</div>
            ) : (
              images.map((image, index) => {
                const src = resolveImageSrc(image);
                return (
                  <figure className={styles.imageResult} key={`${src.slice(0, 32)}-${index}`}>
                    <img src={src} alt={image.revisedPrompt || imagePrompt} />
                    <figcaption>
                      <span>{image.revisedPrompt || imagePrompt}</span>
                      <button
                        type="button"
                        onClick={() => downloadImage(image, index)}
                        aria-label={t('chat.download_image')}
                      >
                        <IconDownload size={14} />
                      </button>
                    </figcaption>
                  </figure>
                );
              })
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
