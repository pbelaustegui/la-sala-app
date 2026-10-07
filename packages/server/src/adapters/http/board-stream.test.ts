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

const provision = async (app: App, count = 2) => {
  await send(app, '/admin/pistes', { count }, { 'x-admin-pin': ADMIN });
  await send(app, '/pistes/1/bout', { weapon: 'foil', left: 'Ana', right: 'Bea' }, JUDGE);
};

/** Reads SSE frames (blocks ending in a blank line) from a body, regardless of chunking. */
function frames(res: Response) {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  return {
    async next(): Promise<string> {
      while (!buffer.includes('\n\n')) {
        const { value, done } = await reader.read();
        if (done) throw new Error('stream ended');
        buffer += decoder.decode(value);
      }
      const end = buffer.indexOf('\n\n') + 2;
      const frame = buffer.slice(0, end);
      buffer = buffer.slice(end);
      return frame;
    },
    cancel: () => reader.cancel(),
  };
}

const eventOf = (frame: string) => frame.split('\n').find((l) => l.startsWith('event: '))!.slice(7);
const dataOf = (frame: string) => JSON.parse(frame.split('\n').find((l) => l.startsWith('data: '))!.slice(6));

describe('GET /pistes/stream', () => {
  it('needs no PIN, answers as an event stream and is not captured by /pistes/:id/...', async () => {
    const { app } = setup();
    await provision(app);
    const res = await app.request('/pistes/stream');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    await res.body!.cancel();
  });

  it('sends the piste set and one snapshot per piste on connect', async () => {
    const { app } = setup();
    await provision(app);
    const stream = frames(await app.request('/pistes/stream'));

    const set = await stream.next();
    expect(eventOf(set)).toBe('pistes');
    expect(dataOf(set)).toEqual({ pisteIds: ['1', '2'] });

    const first = await stream.next();
    expect(eventOf(first)).toBe('snapshot');
    expect(dataOf(first)).toMatchObject({ pisteId: '1', snapshot: { serverTime: T0, fencers: { left: 'Ana' }, bout: { phase: { kind: 'scheduled' } } } });
    expect(dataOf(await stream.next())).toMatchObject({ pisteId: '2', snapshot: { bout: null, fencers: null } });
    await stream.cancel();
  });

  it('sends one message per change on any piste', async () => {
    const { app } = setup();
    await provision(app);
    const stream = frames(await app.request('/pistes/stream'));
    for (let i = 0; i < 3; i++) await stream.next();

    await send(app, '/pistes/1/events', { events: [{ id: 'a', type: 'clock-started', at: T0 }] }, JUDGE);
    expect(dataOf(await stream.next())).toMatchObject({ pisteId: '1', snapshot: { bout: { phase: { kind: 'fencing' } } } });

    await send(app, '/pistes/2/bout', { weapon: 'epee', left: 'C', right: 'D' }, { 'x-piste-pin': '1001' });
    expect(dataOf(await stream.next())).toMatchObject({ pisteId: '2', snapshot: { fencers: { left: 'C' } } });
    await stream.cancel();
  });

  it('resyncs when pistes are replaced: a new set, then fresh snapshots', async () => {
    const { app } = setup();
    await provision(app, 3);
    const stream = frames(await app.request('/pistes/stream'));
    for (let i = 0; i < 4; i++) await stream.next();

    await send(app, '/admin/pistes', { count: 1 }, { 'x-admin-pin': ADMIN });
    const set = await stream.next();
    expect(eventOf(set)).toBe('pistes');
    expect(dataOf(set)).toEqual({ pisteIds: ['1'] });
    expect(dataOf(await stream.next())).toMatchObject({ pisteId: '1', snapshot: { bout: null } });
    await stream.cancel();
  });

  it('does not touch the per-piste stream route', async () => {
    const { app } = setup();
    await provision(app);
    expect((await app.request('/pistes/99/stream')).status).toBe(404);
  });

  it('removes the subscriber when the client disconnects', async () => {
    const { app, hub } = setup();
    await provision(app);
    const stream = frames(await app.request('/pistes/stream'));
    await stream.next();
    expect(hub.boardSubscriberCount()).toBe(1);
    await stream.cancel();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(hub.boardSubscriberCount()).toBe(0);
  });

  it('sends a real `ping` event with the server time at the heartbeat cadence', async () => {
    const { app, clock } = setup(20);
    await provision(app);
    clock.set(T0 + 777);
    const stream = frames(await app.request('/pistes/stream'));
    for (let i = 0; i < 3; i++) await stream.next();
    const ping = await stream.next();
    expect(eventOf(ping)).toBe('ping');
    expect(dataOf(ping)).toEqual({ serverTime: T0 + 777 });
    await stream.cancel();
  });

  it('does not send comment heartbeats on the board feed any more', async () => {
    const { app } = setup(20);
    await provision(app);
    const stream = frames(await app.request('/pistes/stream'));
    for (let i = 0; i < 3; i++) await stream.next();
    for (let i = 0; i < 2; i++) expect(await stream.next()).not.toContain(': heartbeat');
    await stream.cancel();
  });
});

describe('board stream over a real socket', () => {
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

  it('streams every piste and live changes to a real client, then cleans up', async () => {
    const abort = new AbortController();
    const res = await fetch(`${base}/pistes/stream`, { signal: abort.signal });
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    const stream = frames(res);
    expect(dataOf(await stream.next()).pisteIds).toEqual(['1', '2']);
    expect(dataOf(await stream.next()).pisteId).toBe('1');
    expect(dataOf(await stream.next()).pisteId).toBe('2');

    await fetch(`${base}/pistes/1/events`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...JUDGE },
      body: JSON.stringify({ events: [{ id: 'a', type: 'clock-started', at: T0 }] }),
    });
    expect(dataOf(await stream.next()).snapshot.bout.phase.kind).toBe('fencing');

    abort.abort();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(hub.boardSubscriberCount()).toBe(0);
  });
});
