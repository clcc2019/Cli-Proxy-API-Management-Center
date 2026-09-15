import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@/styles/global.scss';
import { initializeI18n } from '@/i18n';
import App from './App.tsx';

document.title = 'Toka';
document.documentElement.setAttribute('translate', 'no');
document.documentElement.classList.add('notranslate');
document.documentElement.dataset.inputModality = 'pointer';

document.addEventListener(
  'pointerdown',
  () => {
    document.documentElement.dataset.inputModality = 'pointer';
  },
  { capture: true, passive: true }
);

document.addEventListener(
  'keydown',
  (event) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    document.documentElement.dataset.inputModality = 'keyboard';
  },
  { capture: true }
);

const PRELOAD_RELOAD_KEY = 'toka:preload-reload';
const PRELOAD_RELOAD_COOLDOWN_MS = 10_000;

const getHashPathname = () => {
  const hash = window.location.hash.replace(/^#/, '');
  return (hash.split(/[?#]/, 1)[0] || '/').replace(/\/+$/, '') || '/';
};

const scheduleLoginPreload = () => {
  const hashPathname = getHashPathname();
  let hasStoredSession = false;

  try {
    // These storage keys are intentionally read without importing the auth
    // store. Keeping the bootstrap dependency-free prevents auth recovery and
    // API client code from joining the entry graph just to decide whether a
    // non-critical page chunk should be prefetched.
    hasStoredSession = Boolean(
      window.sessionStorage.getItem('cli-proxy-auth-session') ||
        window.localStorage.getItem('cli-proxy-auth')
    );
  } catch {
    // Storage can be unavailable in privacy-restricted contexts. Preloading
    // remains a safe fallback for a likely unauthenticated visitor.
  }

  const preload = () => {
    void import('./pages/LoginPage').catch(() => undefined);
  };

  if (hashPathname === '/login') {
    preload();
    return;
  }

  if (hasStoredSession) return;

  const idleWindow = window as Window & {
    requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
  };
  if (typeof idleWindow.requestIdleCallback === 'function') {
    idleWindow.requestIdleCallback(preload, { timeout: 2_000 });
  } else {
    window.setTimeout(preload, 1_200);
  }
};

window.addEventListener('vite:preloadError', (event) => {
  try {
    const lastReload = Number(sessionStorage.getItem(PRELOAD_RELOAD_KEY));
    if (Date.now() - lastReload < PRELOAD_RELOAD_COOLDOWN_MS) return;
    sessionStorage.setItem(PRELOAD_RELOAD_KEY, String(Date.now()));
    event.preventDefault();
    window.location.reload();
  } catch {
    // Let the route error boundary handle environments without session storage.
  }
});

const bootstrap = async () => {
  // 登录页只在当前路径明确需要、或没有任何持久化会话痕迹时预取。
  // 已登录用户的刷新不会为永远不会展示的页面竞争首屏带宽。
  scheduleLoginPreload();
  await initializeI18n();

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>
  );

  // 移除首屏 loading 占位；使用 rAF 保证下一帧再标记，确保首屏已挂载
  requestAnimationFrame(() => {
    document.documentElement.classList.add('__booted__');
  });
};

void bootstrap();
