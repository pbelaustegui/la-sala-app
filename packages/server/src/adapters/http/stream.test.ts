import { serve } from '@hono/node-server';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { InProcessHub } from '../memory/in-process-hub';
import { MemoryPisteRepository } from '../memory/memory-piste-repository';
import { FakeClock, SequentialPinGenerator } from '../../testing/fakes';
import { createApp } from './app';

const ADMIN = 'admin-secret';
const T0 = 1_000_000;
const JUDGE = { 'x-piste-pin': '1000' };

type App = ReturnType<typeof createApp>;

function setup(heartbeatMs?: number) {
  const hub = new InProcessHub();
  const clock = new FakeClock(T0);
  const app = createApp({
    adminPin: ADMIN,
    repository: new MemoryPisteRepository(),
    pinGenerator: new SequentialPinGenerator(),
    clock,
    hub,
    heartbeatMs,
  });
  return { app, hub, clock };
}

const send = (app: App, path: string, body: unknown, headers: Record<string, string>) =>
  app.request(path, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });

const provision = async (app: App) => {
  await send(app, '/admin/pistes', { count: 2 }, { 'x-admin-pin': ADMIN });
  await send(app, '/pistes/1/bout', { weapon: 'foil', left: 'Ana', right: 'Bea' }, JUDGE);
};

/** Reads SSE frames from a response body, one network chunk at a time. */
function frames(res: Response) {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  return {
    async next(): Promise<string> {
      const { value, done } = await reader.read();
      if (done) throw new Error('stream ended');
      return decoder.decode(value);
    },
    cancel: () => reader.cancel(),
  };
}

const dataOf = (frame: string) => JSON.parse(frame.split('\n').find((l) => l.startsWith('data: '))!.slice(6));

describe('GET /pistes/:id/stream', () => {
  it('404s on an unknown piste', async () => {
    const { app } = setup();
    await provision(app);
    expect((await app.request('/pistes/99/stream')).status).toBe(404);
  });

  it('answers as an event stream', async () => {
    const { app } = setup();
    await provision(app);
    const res = await app.request('/pistes/1/stream');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    await res.body!.cancel();
  });

  it('sends the snapshot on connect and one message per applied change', async () => {
    const { app } = setup();
    await provision(app);
    const stream = frames(await app.request('/pistes/1/stream'));

    const first = await stream.next();
    expect(first).toContain('event: snapshot');
    expect(dataOf(first)).toMatchObject({ serverTime: T0, fencers: { left: 'Ana' }, bout: { phase: { kind: 'scheduled' } } });

    await send(app, '/pistes/1/events', { events: [{ id: 'a', type: 'clock-started', at: T0 }] }, JUDGE);
    expect(dataOf(await stream.next()).bout.phase.kind).toBe('fencing');

    await send(app, '/pistes/1/events', { events: [{ id: 'b', type: 'touch-scored', side: 'left', at: T0 + 1 }] }, JUDGE);
    expect(dataOf(await stream.next()).bout.score).toEqual({ left: 1, right: 0 });
    await stream.cancel();
  });

  it('does not publish for skipped, rejected or other-piste changes', async () => {
    const { app, hub } = setup();
    await provision(app);
    const seen: number[] = [];
    hub.subscribe('1', (s) => seen.push(s.serverTime));
    const batch = { events: [{ id: 'a', type: 'clock-started', at: T0 }] };
    await send(app, '/pistes/1/events', batch, JUDGE);
    await send(app, '/pistes/1/events', batch, JUDGE); // duplicate: skipped
    await send(app, '/pistes/1/events', { events: [{ id: 'z', type: 'clock-started', at: T0 }] }, JUDGE); // 422
    await send(app, '/pistes/2/bout', { weapon: 'foil', left: 'C', right: 'D' }, { 'x-piste-pin': '1001' });
    expect(seen).toHaveLength(1);
  });

  it('publishes a new bout and a reset when pistes are replaced', async () => {
    const { app, hub } = setup();
    await provision(app);
    const seen: (string | undefined)[] = [];
    hub.subscribe('1', (s) => seen.push(s.bout?.phase.kind));
    await send(app, '/pistes/1/bout', { weapon: 'epee', left: 'C', right: 'D' }, JUDGE);
    await send(app, '/admin/pistes', { count: 1 }, { 'x-admin-pin': ADMIN });
    expect(seen).toEqual(['scheduled', undefined]);
  });

  it('removes the subscriber when the client disconnects', async () => {
    const { app, hub } = setup();
    await provision(app);
    const stream = frames(await app.request('/pistes/1/stream'));
    await stream.next();
    expect(hub.subscriberCount('1')).toBe(1);
    await stream.cancel();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(hub.subscriberCount('1')).toBe(0);
  });

  it('sends heartbeat comments while idle', async () => {
    const { app } = setup(20);
    await provision(app);
    const stream = frames(await app.request('/pistes/1/stream'));
    await stream.next();
    expect(await stream.next()).toBe(': heartbeat\n\n');
    await stream.cancel();
  });
});

describe('stream over a real socket', () => {
  let server: Server;
  let base: string;
  let app: App;
  let hub: InProcessHub;

  beforeEach(async () => {
    ({ app, hub } = setup());
    await provision(app);
    server = serve({ fetch: app.fetch, port: 0, hostname: '127.0.0.1' }) as Server;
    await new Promise((resolve) => server.once('listening', resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterEach(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  });

  it('streams the snapshot and live changes to a real client, then cleans up', async () => {
    const abort = new AbortController();
    const res = await fetch(`${base}/pistes/1/stream`, { signal: abort.signal });
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    const stream = frames(res);
    expect(dataOf(await stream.next()).bout.phase.kind).toBe('scheduled');

    await fetch(`${base}/pistes/1/events`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...JUDGE },
      body: JSON.stringify({ events: [{ id: 'a', type: 'clock-started', at: T0 }] }),
    });
    expect(dataOf(await stream.next()).bout.phase.kind).toBe('fencing');

    abort.abort();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(hub.subscriberCount('1')).toBe(0);
  });
});
