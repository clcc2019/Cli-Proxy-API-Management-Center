import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshButton } from '@/components/ui/RefreshButton';
import { AnchoredPopover } from '@/components/ui/AnchoredPopover';
import { IconAlertTriangle, IconX } from '@/components/ui/icons';
import { authFilesApi } from '@/services/api';
import type { AuthFileItem } from '@/types';
import styles from '@/pages/AuthFilesPageRefresh.module.scss';

export function AuthFileTicketRefreshButton({
  file,
  disabled,
}: {
  file: AuthFileItem;
  disabled: boolean;
}) {
  const { t } = useTranslation();
  const inFlight = useRef(false);
  const [state, setState] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [error, setError] = useState('');
  const [errorOpen, setErrorOpen] = useState(false);
  const label = t('auth_files.codex_turn_state_ticket_refresh_label');
  const message =
    state === 'loading'
      ? t('auth_files.codex_turn_state_ticket_refreshing')
      : state === 'success'
        ? t('auth_files.codex_turn_state_ticket_refresh_success_short')
        : state === 'error'
          ? `${t('auth_files.codex_turn_state_ticket_refresh_failed')}: ${error}`
          : '';

  const refresh = async () => {
    if (disabled || inFlight.current) return;
    inFlight.current = true;
    setState('loading');
    setError('');
    setErrorOpen(false);
    try {
      const result = await authFilesApi.refreshCodexTurnStateTicket(file.name);
      if (result.status !== 'ok') {
        throw new Error(result.error || t('auth_files.codex_turn_state_ticket_refresh_failed'));
      }
      setState('success');
    } catch (err: unknown) {
      const record = err && typeof err === 'object' ? (err as Record<string, unknown>) : null;
      const payload = record?.details ?? record?.data;
      const payloadRecord =
        payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : null;
      const payloadError = payloadRecord?.error;
      const detail =
        typeof payloadError === 'string'
          ? payloadError
          : payloadError &&
              typeof payloadError === 'object' &&
              typeof (payloadError as Record<string, unknown>).message === 'string'
            ? String((payloadError as Record<string, unknown>).message)
            : typeof payloadRecord?.message === 'string'
              ? payloadRecord.message
              : err instanceof Error
                ? err.message
                : String(err);
      const status = typeof record?.status === 'number' ? ` (HTTP ${record.status})` : '';
      setError(`${detail}${status}`);
      setState('error');
      setErrorOpen(true);
    } finally {
      inFlight.current = false;
    }
  };

  return (
    <span className={styles.ticketRefresh}>
      <RefreshButton
        variant="ghost"
        size="sm"
        className={styles.ticketRefreshButton}
        label={label}
        iconSize={13}
        loading={state === 'loading'}
        disabled={disabled || state === 'loading'}
        onClick={(event) => {
          event.stopPropagation();
          void refresh();
        }}
      />
      {state === 'error' ? (
        <AnchoredPopover
          open={errorOpen}
          onOpenChange={setErrorOpen}
          ariaLabel={t('auth_files.codex_turn_state_ticket_refresh_failed')}
          width={320}
          maxHeight={320}
          className={styles.ticketErrorPopover}
          trigger={
            <button
              type="button"
              className={styles.ticketErrorTrigger}
              aria-haspopup="dialog"
              aria-label={t('auth_files.codex_turn_state_ticket_refresh_failed')}
              onClick={(event) => event.stopPropagation()}
            >
              <IconAlertTriangle size={13} aria-hidden="true" />
              <span>Ticket</span>
            </button>
          }
        >
          <div className={styles.ticketErrorHeader}>
            <IconAlertTriangle size={16} aria-hidden="true" />
            <strong>{t('auth_files.codex_turn_state_ticket_refresh_failed')}</strong>
            <button
              type="button"
              className={styles.ticketErrorClose}
              aria-label={t('common.close')}
              onClick={(event) => {
                event.stopPropagation();
                setErrorOpen(false);
              }}
            >
              <IconX size={16} aria-hidden="true" />
            </button>
          </div>
          <div className={styles.ticketErrorDetail} role="alert">
            {error}
          </div>
        </AnchoredPopover>
      ) : (
        <span
          className={styles.ticketRefreshResult}
          data-state={state}
          aria-live="polite"
          aria-atomic="true"
          title={message}
        >
          {message}
        </span>
      )}
    </span>
  );
}
