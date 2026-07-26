/**
 * 统一的错误信息提取
 *
 * 此前有 8 份各自实现散落在页面与 hook 里，且已经漂移：
 * 其中 6 份只处理 Error 与 string，另外 2 份还会解包 `{ message }` 形状的对象
 * （axios 之类的错误响应体常是这个形状）。结果是同一个后端错误，
 * 在一部分页面能显示文案，在另一部分页面显示空白。
 *
 * 这里采用能力最全的那一版作为唯一实现。
 */
export const getErrorMessage = (err: unknown): string => {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  if (typeof err !== 'object' || err === null) return '';
  if (!('message' in err)) return '';

  const message = (err as { message?: unknown }).message;
  return typeof message === 'string' ? message : '';
};

/**
 * 与 getErrorMessage 相同，但在取不到信息时返回调用方提供的兜底文案，
 * 避免把空字符串塞进 UI。
 */
export const getErrorMessageOr = (err: unknown, fallback: string): string =>
  getErrorMessage(err) || fallback;
