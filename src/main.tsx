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

const bootstrap = async () => {
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
