import { useLanguageStore } from '@/stores/useLanguageStore';
import styles from './RouteErrorFallback.module.scss';

const copy = {
  'zh-CN': {
    title: '页面加载失败',
    description: '页面资源可能刚刚更新，或网络暂时不可用。请刷新后重试。',
    action: '刷新页面',
  },
  en: {
    title: 'Page failed to load',
    description: 'The page may have been updated, or the network is temporarily unavailable.',
    action: 'Reload page',
  },
};

export function RouteErrorFallback() {
  const content = copy[useLanguageStore((state) => state.language)];

  return (
    <main className={styles.page} data-xai-mode="console">
      <section className={styles.panel} role="alert">
        <h1 className={styles.title}>{content.title}</h1>
        <p className={styles.description}>{content.description}</p>
        <button className={styles.action} type="button" onClick={() => window.location.reload()}>
          {content.action}
        </button>
      </section>
    </main>
  );
}
