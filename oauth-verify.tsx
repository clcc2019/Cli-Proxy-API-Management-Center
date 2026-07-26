// TEMP-VERIFY: 临时验证 OAuth 超时路径用的挂载点，验证完删除。
// 直接挂载真实的 OAuthPage（含真实 useOAuthFlow / 真实 oauthApi），
// 只把 apiClient 指向 /tmp/oauth-mock 的假后端。
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { apiClient } from '@/services/api/client';
import '@/i18n';
import '@/styles/global.scss';
import { OAuthPage } from '@/pages/OAuthPage';

apiClient.setConfig({ apiBase: 'http://localhost:8317', managementKey: 'mock-key' });

// 把状态变化按时间线记录下来，供外部断言（避免只靠肉眼看）
type Entry = { t: number; text: string };
const log: Entry[] = [];
const t0 = Date.now();
const seen = new Set<string>();
const record = () => {
  const root = document.getElementById('root');
  if (!root) return;
  // 抓所有 role=status / role=alert 的可见文本
  const nodes = Array.from(root.querySelectorAll('[role="status"],[role="alert"]'));
  nodes.forEach((n) => {
    const text = (n.textContent || '').replace(/\s+/g, ' ').trim();
    if (!text) return;
    // 已等待时长每秒变化，归一化后再去重，只记录“种类”的首次出现
    const norm = text.replace(/\d{2}:\d{2}/g, 'MM:SS');
    if (seen.has(norm)) return;
    seen.add(norm);
    log.push({ t: Date.now() - t0, text: norm });
  });
};
setInterval(record, 200);

declare global {
  interface Window {
    __log: () => Entry[];
    __click: (label: string) => boolean;
    __texts: () => string[];
  }
}
window.__log = () => log;
window.__texts = () =>
  Array.from(document.querySelectorAll('#root button, #root [role="status"], #root [role="alert"]'))
    .map((n) => (n.textContent || '').replace(/\s+/g, ' ').trim())
    .filter(Boolean);
window.__click = (label: string) => {
  const btn = Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find((b) =>
    (b.textContent || '').includes(label)
  );
  if (!btn) return false;
  btn.click();
  return true;
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MemoryRouter>
      <OAuthPage />
    </MemoryRouter>
  </StrictMode>
);
