import { describe, expect, it } from 'vitest';
import { createServices, type AppEnv } from '../env';
import { LocalBout } from '../core/local-bout';
import { FakeServer } from '../core/testing/fake-server';
import type { VisibilitySource, WakeLockPort } from '../core/wake-lock';
import { createMemoryEnv } from '../testing/memory-env';
import { FakeTimers } from '../testing/fake-timers';
import { createJudgeSession } from './judge-session';

const PIN = '4821';
const SETUP = { weapon: 'epee', left: 'Ana', right: 'Bea' } as const;

function harness(options: { skewMs?: number; wakeLock?: WakeLockPort | null; visibility?: VisibilitySource } = {}) {
  // The server clock runs `skewMs` ahead of the phone.
  let phone = 1_000_000;
  const skewMs = options.skewMs ?? 0;
  const server = new FakeServer({ pisteId: 'p1', pin: PIN, serverNow: () => phone + skewMs });
  server.setup = { ...SETUP };
  const timers = new FakeTimers();
  const online = new Set<() => void>();
  const env: AppEnv = createMemoryEnv({
    fetch: server.fetch,
    now: () => phone,
    timers,
    onOnline: (callback) => {
      online.add(callback);
      return () => void online.delete(callback);
    },
    ...(options.wakeLock !== undefined ? { wakeLock: options.wakeLock } : {}),
    ...(options.visibility ? { visibility: options.visibility } : {}),
  });
  const services = createServices(env);
  const bout = LocalBout.create(env.storage, { pisteId: 'p1', boutId: 'b1' }, SETUP);
  const open = (startedOffline = false) => createJudgeSession({ services, pisteId: 'p1', pin: PIN, bout, startedOffline });
  return { server, env, services, bout, timers, online, open, advance: (ms: number) => void (phone += ms) };
}

describe('createJudgeSession', () => {
  it('sends events scored on the scoreboard to the server', async () => {
    const h = harness();
    const session = h.open();
    session.controller.toggleClock();
    h.advance(1_000);
    session.controller.touch('left');
    await session.queue.whenIdle();

    expect(h.server.events.map((e) => e.event.type)).toEqual(['clock-started', 'touch-scored']);
    expect(session.queue.connection.get()).toMatchObject({ status: 'online', pending: 0 });
    session.dispose();
  });

  it('flushes what the device already holds when the session opens', async () => {
    const h = harness();
    h.bout.append({ id: 'old-1', event: { type: 'clock-started', at: 1_000_000 } });
    const session = h.open();
    await session.queue.whenIdle();
    expect(h.server.events.map((e) => e.id)).toEqual(['old-1']);
    session.dispose();
  });

  it('keeps scoring while offline and flushes in order when the browser comes back online', async () => {
    const h = harness();
    const session = h.open();
    h.server.down = true;
    session.controller.toggleClock();
    h.advance(1_000);
    session.controller.touch('right');
    await session.queue.whenIdle();

    expect(session.controller.get().score).toEqual({ left: 0, right: 1 });
    expect(session.queue.connection.get()).toMatchObject({ status: 'offline', pending: 2 });
    expect(h.server.events).toHaveLength(0);

    h.server.down = false;
    for (const callback of h.online) callback();
    await session.queue.whenIdle();

    expect(h.server.events.map((e) => e.event.type)).toEqual(['clock-started', 'touch-scored']);
    expect(session.queue.connection.get()).toMatchObject({ status: 'online', pending: 0 });
    session.dispose();
  });

  it('shows offline when opened without a connection and recovers when it returns', async () => {
    const h = harness();
    h.server.down = true;
    const session = h.open(true);
    await session.queue.whenIdle();
    expect(session.queue.connection.get().status).toBe('offline');

    h.server.down = false;
    for (const callback of h.online) callback();
    await session.queue.whenIdle();
    expect(session.queue.connection.get().status).toBe('online');
    session.dispose();
  });

  it('opening offline never discards events the device still has to send', async () => {
    const h = harness();
    h.bout.append({ id: 'keep', event: { type: 'clock-started', at: 1_000_000 } });
    h.server.down = true;
    const session = h.open(true);
    await session.queue.whenIdle();
    expect(h.bout.pending().map((e) => e.id)).toEqual(['keep']);

    h.server.down = false;
    for (const callback of h.online) callback();
    await session.queue.whenIdle();
    expect(h.server.events.map((e) => e.id)).toEqual(['keep']);
    session.dispose();
  });

  it('stamps events with server-corrected time when the phone clock is behind', async () => {
    const h = harness({ skewMs: 60_000 });
    await h.services.api.getSnapshot('p1');
    const session = h.open();
    session.controller.toggleClock();
    await session.queue.whenIdle();
    expect(h.server.events[0]?.event.at).toBe(1_060_000);
    session.dispose();
  });

  it('stops listening and ticking on dispose', () => {
    const h = harness();
    const session = h.open();
    expect(h.online.size).toBe(1);
    expect(h.timers.scheduled.size).toBe(1);
    session.dispose();
    expect(h.online.size).toBe(0);
    expect(h.timers.scheduled.size).toBe(0);
  });

  it('cancels a pending retry on dispose so nothing is sent after leaving the screen', async () => {
    const h = harness();
    h.server.down = true;
    const session = h.open();
    session.controller.toggleClock();
    await session.queue.whenIdle();
    expect(h.timers.scheduled.size).toBe(2);
    session.dispose();
    expect(h.timers.scheduled.size).toBe(0);
  });

  it('keeps the screen awake only while a bout is running', async () => {
    const requests: string[] = [];
    const wakeLock: WakeLockPort = {
      request: async (type) => {
        requests.push(type);
        return { release: async () => undefined, addEventListener: () => undefined };
      },
    };
    const h = harness({ wakeLock });
    const session = h.open();
    await Promise.resolve();
    expect(requests).toEqual([]);
    session.controller.toggleClock();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(requests).toEqual(['screen']);
    expect(session.wakeLock.get()).toBe('active');
    session.dispose();
  });
});
