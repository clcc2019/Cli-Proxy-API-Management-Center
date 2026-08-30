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
  // 在 i18n/会话恢复期间提前下载登录页 chunk。管理壳层与登录页是互斥
  // 路径，等认证完成后再按需加载，避免未登录用户承担整套管理 UI 的解析成本。
  void import('./pages/LoginPage').catch(() => undefined);
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
