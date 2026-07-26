/**
 * OAuth 登录流程的状态机与轮询
 *
 * 每个 provider 一份独立状态与独立定时器，可同时对多个 provider 发起登录。
 *
 * 轮询设计要点（其中若干条是此前踩过的坑，改动时请留意）：
 * - 定时器身份校验：stopPolling 只在 timers.current[provider] 与 expectedTimer
 *   一致时才关表，避免「旧表的回调关掉新表」。
 * - 重入守卫：/get-auth-status 慢于轮询间隔时，pollingRequestsInFlight 阻止请求堆叠。
 * - 已等待时长用独立的 1s tick 驱动，轮询表的 delay 恒为 3s，
 *   因此秒级重渲染不会重启轮询（useInterval 的 effect 只依赖 delay 与稳定回调）。
 * - 不用 useVisibleInterval：用户去浏览器完成授权时本页面必然处于隐藏状态，
 *   而那正是最需要检测到结果的时刻，暂停轮询会恰好错过它。
 * - 弹窗关闭后轮询继续，只有 cancel 与卸载才停表；授权在外部浏览器完成，
 *   用户很可能关掉弹窗去别处等待。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { oauthApi, type OAuthProvider } from '@/services/api/oauth';
import { useInterval } from '@/hooks';
import { getErrorMessage } from '@/utils/error';
import { AUTH_FILES_REFRESH_EVENT } from '@/utils/constants';

export const OAUTH_POLL_INTERVAL_MS = 3_000;
// 用户要切到浏览器完成授权（可能还需登录、选账号、过二次验证），
// 这个时长覆盖的是整个人工操作过程，不是单次请求，因此留足 5 分钟。
export const OAUTH_TIMEOUT_MS = 5 * 60 * 1000;

const ELAPSED_TICK_MS = 1_000;

/** 终态错误：流程已停止，只能重新授权 */
export type OAuthErrorKind = 'start' | 'poll' | 'missingState' | 'unauthorized';

/** 回调提交错误：轮询仍在继续，用户可改正 URL 重试（见 awaiting.callbackError） */
export type OAuthCallbackErrorKind = 'callback' | 'unsupported';

export type OAuthFlowState =
  | { phase: 'idle' }
  | { phase: 'starting' }
  /**
   * callbackError：回调提交失败的内联提示。挂在 awaiting 上而不是切到 error，
   * 是因为此时轮询仍在跑、授权链接依然有效——用户应该能改正 URL 重试。
   * 若切到 error 而不停表，下一次轮询回调还会把这个错误覆盖掉。
   */
  | {
      phase: 'awaiting';
      url: string;
      state: string;
      startedAt: number;
      callbackError?: { kind: OAuthCallbackErrorKind; message: string };
    }
  | { phase: 'submitting'; url: string; state: string; startedAt: number }
  | { phase: 'success' }
  | { phase: 'timedOut'; url: string }
  | { phase: 'error'; kind: OAuthErrorKind; message: string; url?: string };

type StateMap = Partial<Record<OAuthProvider, OAuthFlowState>>;
type TimerMap = Partial<Record<OAuthProvider, number>>;

const IDLE: OAuthFlowState = { phase: 'idle' };

const getStatusCode = (err: unknown): number | undefined => {
  if (!err || typeof err !== 'object' || !('status' in err)) return undefined;
  const status = (err as { status?: unknown }).status;
  return typeof status === 'number' ? status : undefined;
};

/** 轮询/提交进行中的阶段，仍持有 url 与 state */
const isLive = (
  state: OAuthFlowState
): state is Extract<OAuthFlowState, { phase: 'awaiting' | 'submitting' }> =>
  state.phase === 'awaiting' || state.phase === 'submitting';

export function useOAuthFlow() {
  const [states, setStates] = useState<StateMap>({});
  /** 由秒级 tick 更新，供 UI 计算已等待时长 */
  const [now, setNow] = useState(() => Date.now());
  const timers = useRef<TimerMap>({});
  const pollingRequestsInFlight = useRef<TimerMap>({});
  const mountedRef = useRef(true);
  /**
   * 每个 provider 的运行序号，start / cancel 时自增。
   * 定时器身份校验挡不住「同一 provider 上一轮的在途请求」——快速点两次
   * 「重新授权」时，旧一轮的响应仍会回来并覆盖新一轮的状态。
   * 所有异步续体都在写状态前比对自己出发时的 runId。
   */
  const runIds = useRef<Partial<Record<OAuthProvider, number>>>({});

  const nextRunId = useCallback((provider: OAuthProvider) => {
    const next = (runIds.current[provider] ?? 0) + 1;
    runIds.current[provider] = next;
    return next;
  }, []);

  const isCurrentRun = useCallback(
    (provider: OAuthProvider, runId: number) =>
      mountedRef.current && runIds.current[provider] === runId,
    []
  );

  const getState = useCallback(
    (provider: OAuthProvider): OAuthFlowState => states[provider] ?? IDLE,
    [states]
  );

  const setState = useCallback((provider: OAuthProvider, next: OAuthFlowState) => {
    setStates((prev) => ({ ...prev, [provider]: next }));
  }, []);

  const stopPolling = useCallback((provider: OAuthProvider, expectedTimer?: number) => {
    const timer = timers.current[provider];
    if (!timer || (expectedTimer !== undefined && timer !== expectedTimer)) {
      return;
    }

    window.clearInterval(timer);
    delete timers.current[provider];
    if (
      expectedTimer === undefined ||
      pollingRequestsInFlight.current[provider] === expectedTimer
    ) {
      delete pollingRequestsInFlight.current[provider];
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      Object.values(timers.current).forEach((timer) => window.clearInterval(timer));
      timers.current = {};
      pollingRequestsInFlight.current = {};
    };
  }, []);

  /** 停表并落一个错误态，沿用当前 url 以便用户重试 */
  const failPolling = useCallback(
    (provider: OAuthProvider, kind: OAuthErrorKind, message: string) => {
      setStates((prev) => {
        const current = prev[provider];
        return {
          ...prev,
          [provider]: {
            phase: 'error',
            kind,
            message,
            url: current && isLive(current) ? current.url : undefined,
          },
        };
      });
    },
    []
  );

  const startPolling = useCallback(
    (provider: OAuthProvider, authState: string, startedAt: number, runId: number) => {
      stopPolling(provider);

      const timer = window.setInterval(async () => {
        // 上一轮请求还没回来，跳过本轮，避免堆叠
        if (pollingRequestsInFlight.current[provider] === timer) return;

        if (Date.now() - startedAt >= OAUTH_TIMEOUT_MS) {
          stopPolling(provider, timer);
          if (!isCurrentRun(provider, runId)) return;
          setStates((prev) => {
            const current = prev[provider];
            if (!current || !isLive(current)) return prev;
            return { ...prev, [provider]: { phase: 'timedOut', url: current.url } };
          });
          return;
        }

        pollingRequestsInFlight.current[provider] = timer;
        try {
          const res = await oauthApi.getAuthStatus(authState);
          if (!isCurrentRun(provider, runId)) return;

          if (res.status === 'ok') {
            stopPolling(provider, timer);
            setState(provider, { phase: 'success' });
            window.dispatchEvent(new Event(AUTH_FILES_REFRESH_EVENT));
          } else if (res.status === 'error') {
            stopPolling(provider, timer);
            failPolling(provider, 'poll', res.error ?? '');
          }
          // status === 'wait'：继续等下一轮
        } catch (err: unknown) {
          if (!isCurrentRun(provider, runId)) return;
          stopPolling(provider, timer);
          // 轮询请求带 skipUnauthorizedLogout（避免中途把用户踢出后台），
          // 因此 401 不会再触发全局登出——必须在这里明确报错，
          // 否则管理密钥失效时界面只会静静转满 5 分钟。
          const status = getStatusCode(err);
          if (status === 401 || status === 403) {
            failPolling(provider, 'unauthorized', getErrorMessage(err));
          } else {
            failPolling(provider, 'poll', getErrorMessage(err));
          }
        } finally {
          if (pollingRequestsInFlight.current[provider] === timer) {
            delete pollingRequestsInFlight.current[provider];
          }
        }
      }, OAUTH_POLL_INTERVAL_MS);

      timers.current[provider] = timer;
    },
    [failPolling, isCurrentRun, setState, stopPolling]
  );

  const start = useCallback(
    async (provider: OAuthProvider) => {
      stopPolling(provider);
      const runId = nextRunId(provider);
      // 上一轮结束后 tick 会停掉，now 可能停留在很早的时刻；
      // 这里同步一次，避免新一轮开始的第一秒显示错误的已等待时长
      setNow(Date.now());
      setState(provider, { phase: 'starting' });

      try {
        const res = await oauthApi.startAuth(provider);
        if (!isCurrentRun(provider, runId)) return;

        // 没有 state 就无从轮询：明确报错，而不是留在永久等待里
        if (!res.state) {
          setState(provider, { phase: 'error', kind: 'missingState', message: '', url: res.url });
          return;
        }

        const startedAt = Date.now();
        setState(provider, {
          phase: 'awaiting',
          url: res.url,
          state: res.state,
          startedAt,
        });
        startPolling(provider, res.state, startedAt, runId);
      } catch (err: unknown) {
        if (!isCurrentRun(provider, runId)) return;
        setState(provider, { phase: 'error', kind: 'start', message: getErrorMessage(err) });
      }
    },
    [isCurrentRun, nextRunId, setState, startPolling, stopPolling]
  );

  const submitCallback = useCallback(
    async (provider: OAuthProvider, redirectUrl: string) => {
      const current = states[provider];
      if (!current || !isLive(current)) return;
      const runId = runIds.current[provider] ?? 0;

      setState(provider, {
        phase: 'submitting',
        url: current.url,
        state: current.state,
        startedAt: current.startedAt,
      });
      try {
        await oauthApi.submitCallback(provider, redirectUrl);
        if (!isCurrentRun(provider, runId)) return;
        // 回调只是把授权码喂给后端，最终成败仍由轮询判定
        setStates((prev) => {
          const latest = prev[provider];
          if (!latest || latest.phase !== 'submitting') return prev;
          return {
            ...prev,
            [provider]: {
              phase: 'awaiting',
              url: latest.url,
              state: latest.state,
              startedAt: latest.startedAt,
            },
          };
        });
      } catch (err: unknown) {
        if (!isCurrentRun(provider, runId)) return;
        const unsupported = getStatusCode(err) === 404;
        // 回到 awaiting 并带上内联错误：轮询没停、链接仍有效，
        // 用户改正 URL 后可以直接重试。
        setStates((prev) => {
          const latest = prev[provider];
          const base = latest && latest.phase === 'submitting' ? latest : current;
          return {
            ...prev,
            [provider]: {
              phase: 'awaiting',
              url: base.url,
              state: base.state,
              startedAt: base.startedAt,
              callbackError: {
                kind: unsupported ? 'unsupported' : 'callback',
                message: unsupported ? '' : getErrorMessage(err),
              },
            },
          };
        });
      }
    },
    [isCurrentRun, setState, states]
  );

  /** 无服务端取消端点，只能客户端停表并复位；被取消的 state 由后端自行过期 */
  const cancel = useCallback(
    (provider: OAuthProvider) => {
      stopPolling(provider);
      // 自增 runId，让已在途的响应无法再写回状态
      nextRunId(provider);
      setState(provider, IDLE);
    },
    [nextRunId, setState, stopPolling]
  );

  const reset = cancel;

  // 秒级 tick 驱动「已等待时长」：时间戳在这里取（副作用里），
  // 而不是在渲染中调 Date.now()——后者在 React 的纯度规则下不被允许，
  // 也会让计时值随任意一次重渲染漂移。没有进行中的流程时完全停掉。
  const hasLiveFlow = useMemo(
    () => Object.values(states).some((state) => state !== undefined && isLive(state)),
    [states]
  );
  useInterval(() => setNow(Date.now()), hasLiveFlow ? ELAPSED_TICK_MS : null);

  return { getState, start, submitCallback, cancel, reset, now };
}
