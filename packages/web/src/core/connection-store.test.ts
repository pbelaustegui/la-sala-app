import { describe, expect, it } from 'vitest';
import { ConnectionStore, INITIAL_CONNECTION } from './connection-store';

describe('ConnectionStore', () => {
  it('follows the Svelte store contract: subscribe emits the current value at once', () => {
    const store = new ConnectionStore();
    const seen: string[] = [];
    store.subscribe((value) => seen.push(value.status));
    store.set({ ...INITIAL_CONNECTION, status: 'offline' });
    expect(seen).toEqual(['online', 'offline']);
  });

  it('stops notifying after unsubscribe', () => {
    const store = new ConnectionStore();
    const seen: string[] = [];
    const unsubscribe = store.subscribe((value) => seen.push(value.status));
    unsubscribe();
    store.set({ ...INITIAL_CONNECTION, status: 'syncing' });
    expect(seen).toEqual(['online']);
  });

  it('does not notify when the value is unchanged', () => {
    const store = new ConnectionStore();
    let calls = 0;
    store.subscribe(() => calls++);
    store.set({ ...INITIAL_CONNECTION });
    expect(calls).toBe(1);
  });

  it('exposes the current value synchronously', () => {
    const store = new ConnectionStore();
    store.set({ ...INITIAL_CONNECTION, status: 'needs-attention', reason: { kind: 'unauthorized' } });
    expect(store.get().status).toBe('needs-attention');
  });
});
