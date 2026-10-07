/** Synchronous string key-value port. Implementations must never throw. */
export interface KeyValueStorage {
  get(key: string): string | null;
  /** Returns false when the value could not be stored (quota, private mode, disabled). */
  set(key: string, value: string): boolean;
  remove(key: string): void;
}

export interface BoutKeyParts {
  readonly pisteId: string;
  readonly boutId: string;
}

const PREFIX = 'la-sala:v1:bout:';

/** Storage key for a bout. Ids are URI-encoded so separators cannot collide. */
export function boutKey({ pisteId, boutId }: BoutKeyParts): string {
  return `${PREFIX}${encodeURIComponent(pisteId)}:${encodeURIComponent(boutId)}`;
}

export class MemoryStorage implements KeyValueStorage {
  private readonly data = new Map<string, string>();

  get(key: string): string | null {
    return this.data.get(key) ?? null;
  }

  set(key: string, value: string): boolean {
    this.data.set(key, value);
    return true;
  }

  remove(key: string): void {
    this.data.delete(key);
  }
}

/**
 * Adapter over `window.localStorage`. Every access is guarded: merely reading the property
 * can throw (blocked cookies, sandboxed iframes), and writes can fail on quota or in some
 * private modes. A failure degrades to "nothing persisted", never to a crash.
 */
export class LocalStorageAdapter implements KeyValueStorage {
  constructor(private readonly resolve: () => Storage | undefined = () => globalThis.localStorage) {}

  get(key: string): string | null {
    try {
      return this.resolve()?.getItem(key) ?? null;
    } catch {
      return null;
    }
  }

  set(key: string, value: string): boolean {
    try {
      const storage = this.resolve();
      if (!storage) return false;
      storage.setItem(key, value);
      return true;
    } catch {
      return false;
    }
  }

  remove(key: string): void {
    try {
      this.resolve()?.removeItem(key);
    } catch {
      // Nothing to clean up if storage is unavailable.
    }
  }
}
