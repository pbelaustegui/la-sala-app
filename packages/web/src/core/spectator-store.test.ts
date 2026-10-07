import { describe, expect, it } from 'vitest';
import type { Snapshot } from './api-client';
import { SpectatorStore, type BoardStreamHandlers, type BoardStreamPort } from './spectator-store';

class FakePort implements BoardStreamPort {
  opens = 0;
  closes = 0;
  handlers: BoardStreamHandlers | null = null;
  open(handlers: BoardStreamHandlers): void {
    this.opens++;
    this.handlers = handlers;
  }
  close(): void {
    this.closes++;
    this.handlers = null;
  }
}

class FakeTimers {
  now = 10_000;
  private nextId = 1;
  readonly pending = new Map<number, { at: number; fn: () => void }>();
  setTimeout = (fn: () => void, ms: number): number => {
    const id = this.nextId++;
    this.pending.set(id, { at: this.now + ms, fn });
    return id;
  };
  clearTimeout = (id: unknown): void => void this.pending.delete(id as number);
  /** Delay of the only pending timer. */
  get delay(): number {
    const [timer] = [...this.pending.values()];
    return timer!.at - this.now;
  }
  fire(): void {
    const [id, timer] = [...this.pending.entries()][0]!;
    this.pending.delete(id);
    this.now = timer.at;
    timer.fn();
  }
}

const snap = (serverTime: number, left = 'Ana'): Snapshot => ({ serverTime, bout: null, fencers: { left, right: 'Bea' } });

function setup(random = 0.5) {
  const port = new FakePort();
  const timers = new FakeTimers();
  const store = new SpectatorStore({
    port,
    now: () => timers.now,
    setTimeout: timers.setTimeout,
    clearTimeout: timers.clearTimeout,
    random: () => random,
  });
  return { port, timers, store };
}

describe('SpectatorStore', () => {
  it('starts connecting, goes live on open and opens exactly one stream', () => {
    const { port, store } = setup();
    expect(store.get()).toEqual({ connection: 'connecting', pistes: [] });
    store.start();
    store.start();
    expect(port.opens).toBe(1);
    port.handlers!.onOpen();
    expect(store.get().connection).toBe('live');
  });

  it('keeps the latest snapshot per piste with its receipt time and per-message clock offset', () => {
    const { port, timers, store } = setup();
    store.start();
    port.handlers!.onOpen();
    // The server clock reads 50_000 when the client clock reads 10_000: offset +40_000.
    port.handlers!.onMessage({ kind: 'snapshot', pisteId: '1', snapshot: snap(50_000) });
    timers.now = 11_000;
    port.handlers!.onMessage({ kind: 'snapshot', pisteId: '1', snapshot: snap(55_000, 'Carla') });
    const [entry] = store.get().pistes;
    expect(store.get().pistes).toHaveLength(1);
    expect(entry).toMatchObject({ pisteId: '1', receivedAt: 11_000, offsetMs: 44_000, stale: false });
    expect(entry!.snapshot.fencers!.left).toBe('Carla');
  });

  it('orders pistes numerically by id, not lexically', () => {
    const { port, store } = setup();
    store.start();
    for (const id of ['10', '2', '1']) port.handlers!.onMessage({ kind: 'snapshot', pisteId: id, snapshot: snap(1) });
    expect(store.get().pistes.map((p) => p.pisteId)).toEqual(['1', '2', '10']);
  });

  it('drops pistes missing from a `pistes` message and keeps the others', () => {
    const { port, store } = setup();
    store.start();
    for (const id of ['1', '2', '3']) port.handlers!.onMessage({ kind: 'snapshot', pisteId: id, snapshot: snap(1) });
    port.handlers!.onMessage({ kind: 'pistes', pisteIds: ['1', '3'] });
    expect(store.get().pistes.map((p) => p.pisteId)).toEqual(['1', '3']);
  });

  it('marks data stale on a drop, keeps it, and stays stale while retrying', () => {
    const { port, timers, store } = setup();
    store.start();
    port.handlers!.onOpen();
    port.handlers!.onMessage({ kind: 'snapshot', pisteId: '1', snapshot: snap(1) });
    port.handlers!.onError();
    expect(port.closes).toBe(1);
    expect(store.get().connection).toBe('stale');
    expect(store.get().pistes.map((p) => [p.pisteId, p.stale])).toEqual([['1', true]]);
    timers.fire();
    expect(port.opens).toBe(2);
    expect(store.get().connection).toBe('stale');
  });

  it('is live again after reconnecting and each fresh snapshot clears its stale mark', () => {
    const { port, timers, store } = setup();
    store.start();
    port.handlers!.onMessage({ kind: 'snapshot', pisteId: '1', snapshot: snap(1) });
    port.handlers!.onMessage({ kind: 'snapshot', pisteId: '2', snapshot: snap(1) });
    port.handlers!.onError();
    timers.fire();
    port.handlers!.onOpen();
    expect(store.get().connection).toBe('live');
    port.handlers!.onMessage({ kind: 'snapshot', pisteId: '1', snapshot: snap(2) });
    expect(store.get().pistes.map((p) => p.stale)).toEqual([false, true]);
  });

  it('backs off exponentially with jitter, capped, and resets after data arrives', () => {
    const { port, timers, store } = setup(1); // random 1 => no reduction: the full delay
    store.start();
    const delays: number[] = [];
    for (let i = 0; i < 7; i++) {
      port.handlers!.onError();
      delays.push(timers.delay);
      timers.fire();
    }
    expect(delays).toEqual([1000, 2000, 4000, 8000, 16000, 30000, 30000]);
    port.handlers!.onOpen();
    port.handlers!.onMessage({ kind: 'snapshot', pisteId: '1', snapshot: snap(1) });
    port.handlers!.onError();
    expect(timers.delay).toBe(1000);
  });

  it('spreads retries: the delay is between half and all of the backoff step', () => {
    const low = setup(0);
    low.store.start();
    low.port.handlers!.onError();
    expect(low.timers.delay).toBe(500);
  });

  it('stop closes the stream, cancels a pending retry and ignores late callbacks', () => {
    const { port, timers, store } = setup();
    store.start();
    const handlers = port.handlers!;
    handlers.onError();
    store.stop();
    expect(timers.pending.size).toBe(0);
    store.start();
    const stale = handlers;
    stale.onMessage({ kind: 'snapshot', pisteId: '9', snapshot: snap(1) });
    expect(store.get().pistes).toEqual([]);
    store.stop();
    expect(port.closes).toBeGreaterThanOrEqual(2);
  });

  it('follows the Svelte store contract', () => {
    const { port, store } = setup();
    const seen: string[] = [];
    const unsubscribe = store.subscribe((state) => seen.push(state.connection));
    store.start();
    port.handlers!.onOpen();
    unsubscribe();
    port.handlers!.onError();
    expect(seen).toEqual(['connecting', 'live']);
  });
});
