import type { AppEnv } from '../env';
import { MemoryStorage } from '../core/storage';

/** In-memory environment for component tests; pass overrides for the ports a test cares about. */
export function createMemoryEnv(overrides: Partial<AppEnv> = {}): AppEnv {
  let counter = 0;
  return {
    fetch: () => Promise.reject(new TypeError('Failed to fetch')),
    now: () => Date.now(),
    newId: () => `id-${++counter}`,
    random: () => 0.5,
    timers: { setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: (h) => clearTimeout(h as number) },
    storage: new MemoryStorage(),
    sessionStorage: new MemoryStorage(),
    onOnline: () => () => undefined,
    wakeLock: null,
    visibility: { isVisible: () => true, onChange: () => () => undefined },
    ...overrides,
  };
}
