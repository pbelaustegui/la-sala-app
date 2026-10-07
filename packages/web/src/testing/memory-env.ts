import type { AppEnv, ClipboardPort } from '../env';
import { MemoryStorage } from '../core/storage';
import { FakeBoardStream } from './fake-board-stream';

/** Clipboard fake: records what was written; `failing` makes every write reject. */
export class FakeClipboard implements ClipboardPort {
  readonly writes: string[] = [];
  failing = false;

  async writeText(text: string): Promise<void> {
    if (this.failing) throw new Error('Clipboard unavailable');
    this.writes.push(text);
  }
}

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
    onOffline: () => () => undefined,
    onPageShow: () => () => undefined,
    wakeLock: null,
    updates: null,
    boardStream: new FakeBoardStream(),
    clipboard: new FakeClipboard(),
    origin: 'http://localhost:3000',
    visibility: { isVisible: () => true, onChange: () => () => undefined },
    ...overrides,
  };
}
