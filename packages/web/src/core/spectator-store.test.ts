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
  /** Moves time forward, firing every timer that falls due on the way, earliest first. */
  advance(ms: number): void {
    const target = this.now + ms;
    for (;;) {
      const due = [...this.pending.entries()].filter(([, timer]) => timer.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      this.pending.delete(due[0]);
      this.now = due[1].at;
      due[1].fn();
    }
    this.now = target;
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

describe('SpectatorStore watchdog', () => {
  const WATCHDOG = 45_000;

  it('treats 45 s without any message as a dead connection: closes, marks stale and reconnects with backoff', () => {
    const { port, timers, store } = setup(1);
    store.start();
    port.handlers!.onOpen();
    port.handlers!.onMessage({ kind: 'snapshot', pisteId: '1', snapshot: snap(1) });
    timers.advance(WATCHDOG - 1);
    expect(store.get().connection).toBe('live');
    expect(port.closes).toBe(0);

    timers.advance(1);
    expect(port.closes).toBe(1);
    expect(store.get().connection).toBe('stale');
    expect(store.get().pistes.map((p) => p.stale)).toEqual([true]);
    expect(timers.delay).toBe(1_000);

    timers.advance(1_000);
    expect(port.opens).toBe(2);
  });

  it('is reset by every message, a snapshot and a ping alike', () => {
    const { port, timers, store } = setup();
    store.start();
    port.handlers!.onOpen();
    timers.advance(30_000);
    port.handlers!.onMessage({ kind: 'ping', serverTime: 50_000 });
    timers.advance(30_000);
    port.handlers!.onMessage({ kind: 'snapshot', pisteId: '1', snapshot: snap(1) });
    timers.advance(30_000);
    expect(store.get().connection).toBe('live');
    expect(port.closes).toBe(0);
    timers.advance(15_000);
    expect(store.get().connection).toBe('stale');
  });

  it('also guards a connection attempt that never opens', () => {
    const { port, timers, store } = setup();
    store.start();
    timers.advance(WATCHDOG);
    expect(port.closes).toBe(1);
    expect(store.get().connection).toBe('stale');
  });

  it('does not run while the retry is waiting, nor after stop', () => {
    const { port, timers, store } = setup();
    store.start();
    port.handlers!.onError();
    expect(timers.pending.size).toBe(1); // only the retry
    timers.fire();
    store.stop();
    expect(timers.pending.size).toBe(0);
    timers.advance(WATCHDOG * 2);
    expect(port.opens).toBe(2);
  });

  it('keeps dead connections retrying with growing backoff and resets it when data arrives', () => {
    const { port, timers, store } = setup(1);
    store.start();
    const delays: number[] = [];
    for (let i = 0; i < 3; i++) {
      timers.advance(WATCHDOG);
      delays.push(timers.delay);
      timers.fire();
    }
    expect(delays).toEqual([1_000, 2_000, 4_000]);
    port.handlers!.onMessage({ kind: 'ping', serverTime: 1 });
    timers.advance(WATCHDOG);
    expect(timers.delay).toBe(1_000);
  });

  it('a ping refreshes the clock offset of every piste without touching snapshots', () => {
    const { port, timers, store } = setup();
    store.start();
    port.handlers!.onOpen();
    const snapshot = snap(50_000);
    port.handlers!.onMessage({ kind: 'snapshot', pisteId: '1', snapshot });
    const before = store.get().pistes[0]!;
    expect(before.offsetMs).toBe(40_000);

    timers.now = 20_000;
    // The phone clock was corrected: server 70_000 while the phone reads 20_000.
    port.handlers!.onMessage({ kind: 'ping', serverTime: 70_000 });
    const after = store.get().pistes[0]!;
    expect(after.offsetMs).toBe(50_000);
    expect(after.snapshot).toBe(snapshot);
    expect(after.receivedAt).toBe(before.receivedAt);
    expect(after.stale).toBe(false);
  });

  it('a dead connection leaves stale entries with their last offset until a snapshot arrives', () => {
    const { port, timers, store } = setup();
    store.start();
    port.handlers!.onMessage({ kind: 'snapshot', pisteId: '1', snapshot: snap(50_000) });
    timers.advance(WATCHDOG);
    expect(store.get().pistes[0]!.stale).toBe(true);
    expect(store.get().pistes[0]!.offsetMs).toBe(40_000);
  });

  it('a ping makes a connecting store live and does not invent pistes', () => {
    const { port, store } = setup();
    store.start();
    port.handlers!.onMessage({ kind: 'ping', serverTime: 5 });
    expect(store.get()).toEqual({ connection: 'live', pistes: [] });
  });

  it('honours an injected watchdog interval', () => {
    const port = new FakePort();
    const timers = new FakeTimers();
    const store = new SpectatorStore({
      port, now: () => timers.now, setTimeout: timers.setTimeout, clearTimeout: timers.clearTimeout, random: () => 0.5, watchdogMs: 5_000,
    });
    store.start();
    timers.advance(5_000);
    expect(store.get().connection).toBe('stale');
  });

  describe('retryNow', () => {
    const outage = () => {
      const h = setup();
      h.store.start();
      h.port.handlers!.onOpen();
      h.port.handlers!.onError();
      // Offline for a long time: the backoff grows well past the first step.
      for (let i = 0; i < 4; i++) {
        h.timers.fire();
        h.port.handlers!.onError();
      }
      return h;
    };

    it('reconnects at once after a long outage and resets the backoff', () => {
      const { port, timers, store } = outage();
      const opens = port.opens;
      expect(timers.delay).toBeGreaterThan(5_000);
      store.retryNow();
      expect(port.opens).toBe(opens + 1);
      expect(timers.pending.size).toBe(1); // only the watchdog of the new attempt
      port.handlers!.onError();
      expect(timers.delay).toBe(750); // base step again: 1 s * jitter 0.75
    });

    it('never opens two connections when a reconnect is already pending', () => {
      const { port, timers, store } = outage();
      const opens = port.opens;
      store.retryNow(true);
      port.handlers!.onOpen();
      port.handlers!.onMessage({ kind: 'ping', serverTime: 1 });
      timers.advance(40_000); // the cancelled backoff timer must not fire a second connection
      expect(port.opens).toBe(opens + 1);
      expect(port.handlers).not.toBeNull();
    });

    it('is a no-op while live with a recent message, unless forced', () => {
      const { port, timers, store } = setup();
      store.start();
      port.handlers!.onOpen();
      port.handlers!.onMessage({ kind: 'ping', serverTime: 1 });
      timers.advance(44_000);
      store.retryNow();
      expect(port.opens).toBe(1);
      expect(port.closes).toBe(0);
      store.retryNow(true);
      expect(port.opens).toBe(2);
    });

    it('reconnects a live connection that went silent for the watchdog window', () => {
      const { port, timers, store } = setup();
      store.start();
      port.handlers!.onOpen();
      port.handlers!.onMessage({ kind: 'ping', serverTime: 1 });
      timers.now += 45_000; // clock moved without the watchdog firing (suspended page)
      store.retryNow();
      expect(port.opens).toBe(2);
    });

    it('does nothing once stopped', () => {
      const { port, store } = setup();
      store.start();
      store.stop();
      store.retryNow(true);
      expect(port.opens).toBe(1);
    });
  });

  describe('markOffline', () => {
    it('marks the last data stale at once, without waiting for the watchdog', () => {
      const { port, store } = setup();
      store.start();
      port.handlers!.onOpen();
      port.handlers!.onMessage({ kind: 'snapshot', pisteId: '1', snapshot: snap(1) });
      store.markOffline();
      expect(store.get().connection).toBe('stale');
      expect(store.get().pistes[0]!.stale).toBe(true);
    });

    it('keeps a pending reconnect going instead of scheduling another one', () => {
      const { port, timers, store } = setup();
      store.start();
      port.handlers!.onError();
      const delay = timers.delay;
      store.markOffline();
      expect(timers.pending.size).toBe(1);
      expect(timers.delay).toBe(delay);
      timers.fire();
      expect(port.opens).toBe(2);
    });
  });
});
