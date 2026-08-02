/**
 * 复制 OAuth 链接或设备码的按钮
 *
 * toast 通知在本项目已全局关闭（useNotificationStore.showNotification 是空实现），
 * 所以复制结果必须内联反馈，否则用户点完什么都看不到。
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { IconCheck, IconCopy } from '@/components/ui/icons';
import { copyToClipboard } from '@/utils/clipboard';

const FEEDBACK_DURATION_MS = 2_000;

type CopyLinkButtonProps = {
  value: string;
  label: string;
  className?: string;
};

export function CopyLinkButton({ value, label, className }: CopyLinkButtonProps) {
  const { t } = useTranslation();
  const [result, setResult] = useState<'copied' | 'failed' | null>(null);
  const resetTimerRef = useRef<number | null>(null);

  const clearResetTimer = useCallback(() => {
    if (resetTimerRef.current !== null) {
      window.clearTimeout(resetTimerRef.current);
      resetTimerRef.current = null;
    }
  }, []);

  useEffect(() => clearResetTimer, [clearResetTimer]);

  const handleCopy = useCallback(async () => {
    const copied = await copyToClipboard(value);
    setResult(copied ? 'copied' : 'failed');
    // 连点时重新计时，而不是让上一次的定时器提前收走反馈
    clearResetTimer();
    resetTimerRef.current = window.setTimeout(() => {
      resetTimerRef.current = null;
      setResult(null);
    }, FEEDBACK_DURATION_MS);
  }, [clearResetTimer, value]);

  const feedbackText = result === 'copied' ? t('auth_login.copied') : t('notification.copy_failed');

  return (
    <Button variant="secondary" size="sm" className={className} onClick={handleCopy}>
      {result ? <IconCheck size={15} /> : <IconCopy size={15} />}
      <span aria-live="polite">{result ? feedbackText : label}</span>
    </Button>
  );
}
