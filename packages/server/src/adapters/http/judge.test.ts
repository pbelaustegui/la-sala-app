import { beforeEach, describe, expect, it } from 'vitest';
import { MemoryPisteRepository } from '../memory/memory-piste-repository';
import { FakeClock, SequentialPinGenerator } from '../../testing/fakes';
import { createApp } from './app';

const ADMIN = 'admin-secret';
const T0 = 1_000_000;

type App = ReturnType<typeof createApp>;

function setup() {
  const clock = new FakeClock(T0);
  const app = createApp({
    adminPin: ADMIN,
    repository: new MemoryPisteRepository(),
    pinGenerator: new SequentialPinGenerator(),
    clock,
  });
  return { app, clock };
}

const send = (app: App, method: string, path: string, body?: unknown, headers: Record<string, string> = {}) =>
  app.request(path, {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const judge = (pin = '1000') => ({ 'x-piste-pin': pin });
const startBody = { weapon: 'foil', left: 'Ana', right: 'Bea' };
const ev = (id: string, type: string, at: number, extra: object = {}) => ({ id, type, at, ...extra });

describe('judge endpoints', () => {
  let app: App;
  let clock: FakeClock;

  beforeEach(async () => {
    ({ app, clock } = setup());
    await send(app, 'POST', '/admin/pistes', { count: 2 }, { 'x-admin-pin': ADMIN });
  });

  describe('public reads', () => {
    it('lists pistes without pins, idle when no bout', async () => {
      const res = await app.request('/pistes');
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual([
        { id: '1', status: 'idle' },
        { id: '2', status: 'idle' },
      ]);
    });

    it('reports the settled phase as status', async () => {
      await send(app, 'POST', '/pistes/1/bout', startBody, judge());
      await send(app, 'POST', '/pistes/1/events', { events: [ev('a', 'clock-started', T0)] }, judge());
      const res = await app.request('/pistes');
      expect(await res.json()).toEqual([
        { id: '1', status: 'fencing' },
        { id: '2', status: 'idle' },
      ]);
    });

    it('returns a null bout for a piste without a bout', async () => {
      const res = await app.request('/pistes/1/state');
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ serverTime: T0, bout: null, fencers: null });
    });

    it('404s on an unknown piste', async () => {
      expect((await app.request('/pistes/99/state')).status).toBe(404);
    });
  });

  describe('POST /pistes/:id/bout', () => {
    it('requires the piste pin', async () => {
      expect((await send(app, 'POST', '/pistes/1/bout', startBody)).status).toBe(401);
      expect((await send(app, 'POST', '/pistes/1/bout', startBody, judge('1001'))).status).toBe(401);
      expect((await send(app, 'POST', '/pistes/1/bout', startBody, { 'x-admin-pin': ADMIN })).status).toBe(401);
    });

    it('404s on an unknown piste', async () => {
      expect((await send(app, 'POST', '/pistes/99/bout', startBody, judge())).status).toBe(404);
    });

    it('starts a bout and returns the snapshot', async () => {
      const res = await send(app, 'POST', '/pistes/1/bout', { ...startBody, options: { touchLimit: 5 } }, judge());
      expect(res.status).toBe(201);
      const snapshot = (await res.json()) as any;
      expect(snapshot.serverTime).toBe(T0);
      expect(snapshot.fencers).toEqual({ left: 'Ana', right: 'Bea' });
      expect(snapshot.bout.phase).toEqual({ kind: 'scheduled' });
      expect(snapshot.bout.rules.touchLimit).toBe(5);
      expect(snapshot.bout.score).toEqual({ left: 0, right: 0 });
    });

    it.each([
      [{ weapon: 'lance', left: 'A', right: 'B' }],
      [{ weapon: 'foil', left: '', right: 'B' }],
      [{ weapon: 'foil', left: 'A' }],
      [{ weapon: 'foil', left: 'A', right: 'B', options: { periods: 4 } }],
      [{ weapon: 'foil', left: 'A', right: 'B', options: { touchLimit: 0 } }],
    ])('rejects invalid body %j with 400', async (body) => {
      expect((await send(app, 'POST', '/pistes/1/bout', body, judge())).status).toBe(400);
    });

    it('replaces the current bout with a fresh one', async () => {
      await send(app, 'POST', '/pistes/1/bout', startBody, judge());
      await send(app, 'POST', '/pistes/1/events', { events: [ev('a', 'clock-started', T0)] }, judge());
      await send(app, 'POST', '/pistes/1/bout', { ...startBody, left: 'Cris' }, judge());
      const snapshot = (await (await app.request('/pistes/1/state')).json()) as any;
      expect(snapshot.fencers.left).toBe('Cris');
      expect(snapshot.bout.phase.kind).toBe('scheduled');
    });
  });

  describe('POST /pistes/:id/events', () => {
    beforeEach(async () => {
      await send(app, 'POST', '/pistes/1/bout', startBody, judge());
    });

    it('requires the piste pin', async () => {
      const body = { events: [ev('a', 'clock-started', T0)] };
      expect((await send(app, 'POST', '/pistes/1/events', body)).status).toBe(401);
      expect((await send(app, 'POST', '/pistes/1/events', body, judge('0000'))).status).toBe(401);
    });

    it('409s when the piste has no bout', async () => {
      const body = { events: [ev('a', 'clock-started', T0)] };
      const res = await send(app, 'POST', '/pistes/2/events', body, judge('1001'));
      expect(res.status).toBe(409);
    });

    it('applies a batch in order and returns the snapshot', async () => {
      const res = await send(
        app,
        'POST',
        '/pistes/1/events',
        {
          events: [
            ev('a', 'clock-started', T0),
            ev('b', 'touch-scored', T0 + 1000, { side: 'left' }),
            ev('c', 'touch-scored', T0 + 2000, { side: 'left' }),
            ev('d', 'touch-scored', T0 + 3000, { side: 'right' }),
          ],
        },
        judge(),
      );
      expect(res.status).toBe(200);
      const snapshot = (await res.json()) as any;
      expect(snapshot.bout.score).toEqual({ left: 2, right: 1 });
      expect(snapshot.bout.phase).toEqual({ kind: 'fencing', period: 1 });
    });

    it('skips events whose id was already applied (idempotent retry)', async () => {
      const batch = {
        events: [ev('a', 'clock-started', T0), ev('b', 'touch-scored', T0 + 1000, { side: 'left' })],
      };
      await send(app, 'POST', '/pistes/1/events', batch, judge());
      const retry = await send(app, 'POST', '/pistes/1/events', batch, judge());
      expect(retry.status).toBe(200);
      expect(((await retry.json()) as any).bout.score).toEqual({ left: 1, right: 0 });
    });

    it('applies only the new events of a partially known batch', async () => {
      await send(app, 'POST', '/pistes/1/events', { events: [ev('a', 'clock-started', T0)] }, judge());
      const res = await send(
        app,
        'POST',
        '/pistes/1/events',
        { events: [ev('a', 'clock-started', T0), ev('b', 'touch-scored', T0 + 1000, { side: 'right' })] },
        judge(),
      );
      expect(((await res.json()) as any).bout.score).toEqual({ left: 0, right: 1 });
    });

    it('skips a duplicate id inside the same batch', async () => {
      const res = await send(
        app,
        'POST',
        '/pistes/1/events',
        {
          events: [
            ev('a', 'clock-started', T0),
            ev('b', 'touch-scored', T0 + 1000, { side: 'left' }),
            ev('b', 'touch-scored', T0 + 1000, { side: 'left' }),
          ],
        },
        judge(),
      );
      expect(((await res.json()) as any).bout.score.left).toBe(1);
    });

    it('returns 422 {index,error} on the first domain error and persists nothing from the batch', async () => {
      const res = await send(
        app,
        'POST',
        '/pistes/1/events',
        {
          events: [
            ev('a', 'clock-started', T0),
            ev('b', 'touch-scored', T0 + 1000, { side: 'left' }),
            ev('c', 'double-touch-scored', T0 + 2000),
            ev('d', 'touch-scored', T0 + 3000, { side: 'left' }),
          ],
        },
        judge(),
      );
      expect(res.status).toBe(422);
      expect(await res.json()).toEqual({
        index: 2,
        error: { type: 'double-touch-not-allowed', weapon: 'foil' },
      });
      const snapshot = (await (await app.request('/pistes/1/state')).json()) as any;
      expect(snapshot.bout.phase).toEqual({ kind: 'scheduled' });
      expect(snapshot.bout.score).toEqual({ left: 0, right: 0 });
    });

    it('reports the index within the submitted batch even when earlier events were skipped', async () => {
      await send(app, 'POST', '/pistes/1/events', { events: [ev('a', 'clock-started', T0)] }, judge());
      const res = await send(
        app,
        'POST',
        '/pistes/1/events',
        { events: [ev('a', 'clock-started', T0), ev('b', 'clock-started', T0 + 1)] },
        judge(),
      );
      expect(res.status).toBe(422);
      expect(await res.json()).toEqual({ index: 1, error: { type: 'clock-already-running' } });
    });

    it('lets a later batch retry an id that failed before', async () => {
      await send(app, 'POST', '/pistes/1/events', { events: [ev('b', 'touch-scored', T0, { side: 'left' })] }, judge());
      const res = await send(
        app,
        'POST',
        '/pistes/1/events',
        { events: [ev('a', 'clock-started', T0), ev('b', 'touch-scored', T0 + 1, { side: 'left' })] },
        judge(),
      );
      expect(res.status).toBe(200);
    });

    it('supports undo through replay', async () => {
      const res = await send(
        app,
        'POST',
        '/pistes/1/events',
        {
          events: [
            ev('a', 'clock-started', T0),
            ev('b', 'touch-scored', T0 + 1000, { side: 'left' }),
            ev('c', 'undo', T0 + 2000),
          ],
        },
        judge(),
      );
      expect(((await res.json()) as any).bout.score).toEqual({ left: 0, right: 0 });
    });

    it('rejects events after the bout finished', async () => {
      await send(app, 'POST', '/pistes/1/bout', { ...startBody, options: { touchLimit: 1 } }, judge());
      await send(
        app,
        'POST',
        '/pistes/1/events',
        { events: [ev('a', 'clock-started', T0), ev('b', 'touch-scored', T0 + 1, { side: 'left' })] },
        judge(),
      );
      const res = await send(app, 'POST', '/pistes/1/events', { events: [ev('c', 'clock-stopped', T0 + 2)] }, judge());
      expect(res.status).toBe(422);
      expect(await res.json()).toEqual({ index: 0, error: { type: 'bout-finished' } });
    });

    it.each([
      [{}],
      [{ events: 'x' }],
      [{ events: [{ type: 'clock-started', at: 1 }] }],
      [{ events: [{ id: '', type: 'clock-started', at: 1 }] }],
      [{ events: [{ id: 'a', type: 'explode', at: 1 }] }],
      [{ events: [{ id: 'a', type: 'touch-scored', at: 1 }] }],
      [{ events: [{ id: 'a', type: 'touch-scored', side: 'up', at: 1 }] }],
      [{ events: [{ id: 'a', type: 'clock-started', at: 'now' }] }],
      [{ events: [{ id: 'a', type: 'card-given', side: 'left', card: 'blue', at: 1 }] }],
    ])('rejects invalid body %j with 400', async (body) => {
      expect((await send(app, 'POST', '/pistes/1/events', body, judge())).status).toBe(400);
    });

    it('accepts an empty batch and returns the current snapshot', async () => {
      const res = await send(app, 'POST', '/pistes/1/events', { events: [] }, judge());
      expect(res.status).toBe(200);
    });
  });

  describe('GET /pistes/:id/state', () => {
    it('settles the state at server time', async () => {
      await send(app, 'POST', '/pistes/1/bout', { ...startBody, options: { periods: 1, periodDurationMs: 1000 } }, judge());
      await send(app, 'POST', '/pistes/1/events', { events: [ev('a', 'clock-started', T0)] }, judge());
      clock.set(T0 + 500);
      const running = (await (await app.request('/pistes/1/state')).json()) as any;
      expect(running.serverTime).toBe(T0 + 500);
      expect(running.bout.phase.kind).toBe('fencing');
      clock.set(T0 + 5000);
      const expired = (await (await app.request('/pistes/1/state')).json()) as any;
      expect(expired.bout.phase.kind).toBe('priority-draw');
    });

    it('never exposes pins', async () => {
      await send(app, 'POST', '/pistes/1/bout', startBody, judge());
      for (const path of ['/pistes', '/pistes/1/state']) {
        const text = await (await app.request(path)).text();
        expect(text).not.toMatch(/\b100[01]\b/);
        expect(text).not.toContain('pin');
      }
    });
  });
});
