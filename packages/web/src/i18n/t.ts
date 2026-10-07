import { es, type CopyKey } from './es';

export type { CopyKey };

/** Looks up Spanish copy and replaces `{name}` placeholders with `params`. */
export function t(key: CopyKey, params: Readonly<Record<string, string | number>> = {}): string {
  return es[key].replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = params[name];
    return value === undefined ? match : String(value);
  });
}
