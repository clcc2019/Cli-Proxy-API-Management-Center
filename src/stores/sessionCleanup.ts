type SessionCleanup = () => void;

const sessionCleanups = new Map<string, SessionCleanup>();

export const registerSessionCleanup = (key: string, cleanup: SessionCleanup) => {
  sessionCleanups.set(key, cleanup);
};

export const runSessionCleanup = (key: string) => {
  sessionCleanups.get(key)?.();
};

export const runSessionCleanups = () => {
  for (const cleanup of sessionCleanups.values()) {
    try {
      cleanup();
    } catch (error) {
      console.error('Failed to clear session-scoped state:', error);
    }
  }
};
