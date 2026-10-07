import { createBout, createRules } from '@la-sala/domain';
import { describe, expect, it } from 'vitest';
import { ApiClient, type FetchLike } from './api-client';
import { ClockOffset } from './clock-offset';
import { EventFactory } from './event-factory';
import { LocalBout } from './local-bout';
import { MemoryStorage } from './storage';
import { SyncQueue, type Timers } from './sync-queue';
import { FakeServer } from './testing/fake-server';

class FakeTimers implements Timers {
  private nextId = 1;
  readonly scheduled = new Map<number, { fn: () => void; ms: number }>();

  setTimeout(fn: () => void, ms: number): number {
    const id = this.nextId++;
    this.scheduled.set(id, { fn, ms });
    return id;
  }

  clearTimeout(handle: unknown): void {
    this.scheduled.delete(handle as number);
  }

  get delays(): number[] {
    return [...this.scheduled.values()].map((t) => t.ms);
  }

  /** Fires the earliest scheduled timer, as if its delay had elapsed. */
  fire(): void {
    const [id, timer] = [...this.scheduled.entries()][0] ?? [];
    if (id === undefined || !timer) throw new Error('no timer scheduled');
    this.scheduled.delete(id);
    timer.fn();
  }
}

const SETUP = { weapon: 'foil', left: 'Ana', right: 'Bea' } as const;

function harness(
  options: {
    skewMs?: number;
    maxBatch?: number;
    random?: () => number;
    wrapFetch?: (inner: FetchLike) => FetchLike;
  } = {},
) {
  // The phone clock runs `skewMs` behind the server.
  const skewMs = options.skewMs ?? 0;
  let phone = 100_000;
  const server = new FakeServer({ pisteId: 'p1', pin: '1234', serverNow: () => phone + skewMs });
  server.setup = SETUP;
  const clockOffset = new ClockOffset();
  const fetch = options.wrapFetch ? options.wrapFetch(server.fetch) : server.fetch;
  const api = new ApiClient({ fetch, now: () => phone, clockOffset });
  const bout = LocalBout.create(new MemoryStorage(), { pisteId: 'p1', boutId: 'b1' }, SETUP);
  const timers = new FakeTimers();
  let ids = 0;
  const factory = new EventFactory({ newId: () => `e${++ids}`, now: () => clockOffset.correctedNow(phone) });
  const queue = new SyncQueue({
    pisteId: 'p1',
    pin: '1234',
    source: bout,
    api,
    timers,
    random: options.random ?? (() => 1),
    now: () => phone,
    maxBatch: options.maxBatch,
    backoff: { baseMs: 1_000, maxMs: 8_000 },
  });
  const act = (draft: Parameters<EventFactory['create']>[0]) => {
    const result = bout.append(factory.create(draft));
    if (!result.ok) throw new Error(`rejected: ${result.error.type}`);
    queue.kick();
  };
  const serverTypes = () => server.events.map((e) => e.event.type);
  return { server, bout, queue, timers, act, serverTypes, advance: (ms: number) => void (phone += ms), clockOffset, factory };
}

describe('SyncQueue', () => {
  it('sends nothing and stays online when there is nothing pending', async () => {
    const { queue, server } = harness();
    await queue.retryNow();
    expect(server.requests).toHaveLength(0);
    expect(queue.connection.get().status).toBe('online');
  });

  it('flushes new events and acknowledges them', async () => {
    const { queue, act, server, bout } = harness();
    act({ type: 'clock-started' });
    await queue.whenIdle();
    expect(server.events).toHaveLength(1);
    expect(bout.pending()).toEqual([]);
    expect(queue.connection.get()).toMatchObject({ status: 'online', pending: 0 });
  });

  it('queues events while the network is down and flushes them in order on reconnect', async () => {
    const { queue, act, server, bout, serverTypes, timers, advance } = harness();
    server.down = true;

    act({ type: 'clock-started' });
    advance(1_000);
    act({ type: 'touch-scored', side: 'left' });
    advance(1_000);
    act({ type: 'touch-scored', side: 'right' });
    advance(1_000);
    act({ type: 'touch-scored', side: 'left' });
    await queue.whenIdle();

    expect(queue.connection.get()).toMatchObject({ status: 'offline', pending: 4 });
    expect(bout.pending()).toHaveLength(4);
    expect(server.events).toHaveLength(0);
    // The local scoreboard never blocked on the network.
    expect(bout.state(104_000).score).toEqual({ left: 2, right: 1 });
    expect(timers.scheduled.size).toBe(1);

    server.down = false;
    timers.fire();
    await queue.whenIdle();

    expect(serverTypes()).toEqual(['clock-started', 'touch-scored', 'touch-scored', 'touch-scored']);
    expect(server.events.map((e) => e.id)).toEqual(bout.events().map((e) => e.id));
    expect(server.snapshot().bout?.score).toEqual({ left: 2, right: 1 });
    expect(queue.connection.get()).toMatchObject({ status: 'online', pending: 0 });
    expect(bout.pending()).toEqual([]);
  });

  it('does not double-apply when a response is lost and the batch is retried', async () => {
    const { queue, act, server, bout, timers, advance } = harness();
    act({ type: 'clock-started' });
    await queue.whenIdle();

    advance(1_000);
    server.loseResponses = 1; // server applies the batch, the phone never hears back
    act({ type: 'touch-scored', side: 'left' });
    await queue.whenIdle();
    expect(queue.connection.get().status).toBe('offline');
    expect(server.events).toHaveLength(2);
    expect(bout.pending()).toHaveLength(1);

    timers.fire();
    await queue.whenIdle();

    expect(server.events).toHaveLength(2);
    expect(server.snapshot().bout?.score).toEqual({ left: 1, right: 0 });
    expect(bout.pending()).toEqual([]);
    expect(queue.connection.get().status).toBe('online');
  });

  it('sends each event id at most once per batch', async () => {
    const { server, factory } = harness();
    const first = factory.create({ type: 'clock-started' });
    // A source that lists the same event twice must not produce a duplicated batch.
    let acked = false;
    const noisy = {
      events: () => [first, first],
      pending: () => (acked ? [] : [first, first]),
      markSynced: () => void (acked = true),
      resetTo: () => undefined,
    };
    const q = new SyncQueue({
      pisteId: 'p1',
      pin: '1234',
      source: noisy,
      api: new ApiClient({ fetch: server.fetch, now: () => 0 }),
      timers: new FakeTimers(),
      random: () => 0,
      now: () => 0,
    });
    await q.retryNow();
    const body = server.requests.at(-1)!.body as { events: { id: string }[] };
    expect(body.events.map((e) => e.id)).toEqual([first.id]);
  });

  it('retries with exponential backoff and jitter, capped, and resets after success', async () => {
    const { queue, act, server, timers } = harness({ random: () => 0.5 });
    server.down = true;
    act({ type: 'clock-started' });
    await queue.whenIdle();

    const delays: number[] = [];
    for (let i = 0; i < 5; i++) {
      delays.push(timers.delays[0]!);
      timers.fire();
      await queue.whenIdle();
    }
    // equal jitter: half the exponential step plus random * half. Steps 1000, 2000, 4000, 8000, 8000.
    expect(delays).toEqual([750, 1_500, 3_000, 6_000, 6_000]);

    server.down = false;
    timers.fire();
    await queue.whenIdle();
    expect(timers.scheduled.size).toBe(0);

    server.down = true;
    act({ type: 'clock-stopped' });
    await queue.whenIdle();
    expect(timers.delays).toEqual([750]);
  });

  it('retryNow replaces a pending backoff timer (e.g. the browser went online)', async () => {
    const { queue, act, server, timers } = harness();
    server.down = true;
    act({ type: 'clock-started' });
    await queue.whenIdle();
    expect(timers.scheduled.size).toBe(1);

    server.down = false;
    await queue.retryNow();
    expect(timers.scheduled.size).toBe(0);
    expect(server.events).toHaveLength(1);
    expect(queue.connection.get().status).toBe('online');
  });

  it('does not hammer the server: kick during backoff sends nothing', async () => {
    const { queue, act, server, advance } = harness();
    server.down = true;
    act({ type: 'clock-started' });
    await queue.whenIdle();
    const attempts = server.requests.length;
    advance(1_000);
    act({ type: 'touch-scored', side: 'left' });
    await queue.whenIdle();
    expect(server.requests.length).toBe(attempts);
  });

  it('stops on 401, surfaces why, and resumes after the PIN is fixed', async () => {
    const { queue, act, server, timers, bout } = harness();
    server.forceStatus = { status: 401 };
    act({ type: 'clock-started' });
    await queue.whenIdle();

    expect(queue.connection.get()).toMatchObject({
      status: 'needs-attention',
      reason: { kind: 'unauthorized' },
      pending: 1,
    });
    expect(timers.scheduled.size).toBe(0);

    const attempts = server.requests.length;
    act({ type: 'touch-scored', side: 'left' });
    await queue.whenIdle();
    expect(server.requests.length).toBe(attempts); // stopped: kick is a no-op

    queue.setPin('1234');
    await queue.retryNow();
    expect(server.events).toHaveLength(2);
    expect(bout.pending()).toEqual([]);
    expect(queue.connection.get().status).toBe('online');
  });

  it('stops on 429 and reports how long to wait', async () => {
    const { queue, act, server, timers, advance } = harness();
    server.forceStatus = { status: 429, headers: { 'retry-after': '30' } };
    act({ type: 'clock-started' });
    await queue.whenIdle();

    const state = queue.connection.get();
    expect(state.status).toBe('needs-attention');
    expect(state.reason).toEqual({ kind: 'rate-limited', retryAfterMs: 30_000 });
    expect(state.retryAt).toBe(100_000 + 30_000);
    expect(timers.scheduled.size).toBe(0);

    advance(30_000);
    await queue.retryNow();
    expect(server.events).toHaveLength(1);
  });

  it('on 422 resyncs from the server snapshot: server wins and the history is dropped', async () => {
    const { queue, act, server, bout, advance } = harness();
    act({ type: 'clock-started' });
    await queue.whenIdle();

    // Someone else changed the server bout (e.g. a second device stopped the clock).
    advance(5_000);
    server.events.push({ id: 'other', event: { type: 'clock-stopped', at: 105_000 } });

    advance(1_000);
    act({ type: 'clock-stopped' }); // locally valid, but the server already stopped the clock
    act({ type: 'touch-scored', side: 'left' });
    await queue.whenIdle();

    expect(server.events).toHaveLength(2);
    expect(queue.connection.get()).toMatchObject({
      status: 'needs-attention',
      reason: { kind: 'resynced', discarded: 2 },
      pending: 0,
    });
    expect(bout.events()).toEqual([]);
    expect(bout.pending()).toEqual([]);
    expect(bout.state(106_000)).toEqual(server.snapshot().bout);
  });

  it('keeps the pending events if the resync itself cannot reach the server', async () => {
    let calls = 0;
    const { queue, act, server, bout, advance } = harness({
      wrapFetch: (inner) => (input, init) => {
        calls += 1;
        // Call 1 submits the first event, call 2 is the rejected batch; the network dies before call 3.
        if (calls === 3) server.down = true;
        return inner(input, init);
      },
    });
    act({ type: 'clock-started' });
    await queue.whenIdle();
    advance(5_000);
    server.events.push({ id: 'other', event: { type: 'clock-stopped', at: 105_000 } });
    advance(1_000);

    act({ type: 'clock-stopped' });
    await queue.whenIdle();

    expect(queue.connection.get().status).toBe('offline');
    expect(bout.pending()).toHaveLength(1);
  });

  it('splits long queues into ordered batches', async () => {
    const { queue, act, server, advance } = harness({ maxBatch: 2 });
    server.down = true;
    act({ type: 'clock-started' });
    for (let i = 0; i < 4; i++) {
      advance(100);
      act({ type: 'touch-scored', side: 'left' });
    }
    await queue.whenIdle();

    server.down = false;
    server.requests.length = 0;
    await queue.retryNow();

    const sizes = server.requests.map((r) => (r.body as { events: unknown[] }).events.length);
    expect(sizes).toEqual([2, 2, 1]);
    expect(server.snapshot().bout?.score.left).toBe(4);
  });

  it('shows syncing while a request is in flight', async () => {
    const { queue, act } = harness();
    const seen: string[] = [];
    // Pending-count changes re-emit the same status, so collapse consecutive repeats.
    queue.connection.subscribe((s) => {
      if (seen.at(-1) !== s.status) seen.push(s.status);
    });
    act({ type: 'clock-started' });
    await queue.whenIdle();
    expect(seen).toEqual(['online', 'syncing', 'online']);
  });

  it('corrects a skewed phone clock: events carry server-time stamps', async () => {
    const { queue, act, server, advance, clockOffset, factory } = harness({ skewMs: 60_000 });
    // Before the first response the offset is unknown.
    expect(clockOffset.offsetMs).toBe(0);
    await queue.resync();
    expect(clockOffset.offsetMs).toBe(60_000);

    advance(500);
    act({ type: 'clock-started' });
    await queue.whenIdle();
    expect(server.events[0]!.event.at).toBe(100_500 + 60_000);
    expect(factory.create({ type: 'clock-stopped' }).event.at).toBe(100_500 + 60_000);
  });
});

describe('resync', () => {
  it('replaces the local state with the server snapshot', async () => {
    const { queue, server, bout } = harness();
    server.events.push({ id: 'x', event: { type: 'clock-started', at: 100_000 } });
    await queue.resync();
    expect(bout.state(100_000)).toEqual(server.snapshot().bout);
    expect(bout.state(100_000)).not.toEqual(createBout(createRules('foil')));
  });

  it('reports no-bout when the server has none', async () => {
    const { queue, server } = harness();
    server.setup = null;
    await queue.resync();
    expect(queue.connection.get()).toMatchObject({ status: 'needs-attention', reason: { kind: 'no-bout' } });
  });
});
