/**
 * clsx — tiny classname composition utility (zero deps).
 *
 * Pattern: `cx('base', cond && 'active', { on: isOn, disabled: isDisabled })`
 *   - strings pass through
 *   - falsy values (false, null, undefined, 0, '') are dropped
 *   - arrays flatten recursively
 *   - plain objects contribute keys whose values are truthy
 *
 * Returns an empty string if nothing resolves (safe for `className={cx(...)}`).
 */
export type ClassValue =
  | string
  | number
  | bigint
  | boolean
  | null
  | undefined
  | { [key: string]: unknown }
  | ClassValue[];

export function cx(...inputs: ClassValue[]): string {
  const out: string[] = [];
  for (let i = 0; i < inputs.length; i++) {
    const v = inputs[i];
    if (!v) continue;

    if (typeof v === 'string' || typeof v === 'number') {
      out.push(String(v));
      continue;
    }

    if (Array.isArray(v)) {
      const nested = cx(...v);
      if (nested) out.push(nested);
      continue;
    }

    if (typeof v === 'object') {
      for (const key in v) {
        if (Object.prototype.hasOwnProperty.call(v, key) && (v as Record<string, unknown>)[key]) {
          out.push(key);
        }
      }
    }
  }
  return out.join(' ');
}

export default cx;
