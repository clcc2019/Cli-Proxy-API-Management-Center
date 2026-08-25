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
  // 首屏两条最慢的加载:locale JSON 与 Login/MainLayout 懒加载 chunk。
  // 提前并行发起 chunk 请求(i18n/会话恢复期间下载),只取模块副作用,
  // 结果丢弃 —— 真实渲染仍走 App.tsx 内的 lazy(),引用不变、不会双渲染。
  void Promise.all([import('./pages/LoginPage'), import('./components/layout/MainLayout')]).catch(
    () => undefined
  );
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
