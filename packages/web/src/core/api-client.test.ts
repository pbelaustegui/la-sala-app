import { describe, expect, it } from 'vitest';
import { ApiClient, type FetchLike } from './api-client';
import { ClockOffset } from './clock-offset';
import { FakeServer } from './testing/fake-server';

const setup = { weapon: 'foil', left: 'Ana', right: 'Bea' } as const;
const event = (id: string, at: number) => ({ id, event: { type: 'clock-started', at } as const });

function make(skewMs = 0) {
  let phone = 10_000;
  const server = new FakeServer({ pisteId: 'p1', pin: '1234', serverNow: () => phone + skewMs });
  const clockOffset = new ClockOffset();
  const api = new ApiClient({ fetch: server.fetch, now: () => phone, clockOffset });
  return { api, server, clockOffset, advance: (ms: number) => void (phone += ms) };
}

const respond = (status: number, body: unknown = {}, headers: Record<string, string> = {}): FetchLike =>
  async () => Response.json(body, { status, headers });

describe('ApiClient', () => {
  it('starts a bout and posts events with the piste PIN header', async () => {
    const { api, server } = make();
    expect((await api.startBout('p1', '1234', setup)).ok).toBe(true);
    const result = await api.submitEvents('p1', '1234', [event('a', 1_000)]);

    expect(result.ok && result.value.bout?.phase.kind).toBe('fencing');
    const post = server.requests.at(-1)!;
    expect(post.method).toBe('POST');
    expect(post.path).toBe('/pistes/p1/events');
    expect(post.headers['x-piste-pin']).toBe('1234');
    expect(post.body).toEqual({ events: [{ id: 'a', type: 'clock-started', at: 1_000 }] });
  });

  it('sets the piste facing-audience flag with the PIN and returns the snapshot', async () => {
    const { api, server } = make();
    const result = await api.setFacingAudience('p1', '1234', true);

    expect(result.ok && result.value.facingAudience).toBe(true);
    const put = server.requests.at(-1)!;
    expect(put.method).toBe('PUT');
    expect(put.path).toBe('/pistes/p1/facing-audience');
    expect(put.headers['x-piste-pin']).toBe('1234');
    expect(put.body).toEqual({ facing: true });
    expect(server.facingAudience).toBe(true);
    expect(await api.setFacingAudience('p1', 'wrong', false)).toEqual({ ok: false, error: { kind: 'unauthorized' } });
  });

  it('lists pistes and reads snapshots without a PIN', async () => {
    const { api, server } = make();
    await api.startBout('p1', '1234', setup);
    expect(await api.listPistes()).toEqual({ ok: true, value: [{ id: 'p1', status: 'scheduled' }] });
    const snap = await api.getSnapshot('p1');
    expect(snap.ok && snap.value.fencers).toEqual({ left: 'Ana', right: 'Bea' });
    expect(server.requests.at(-1)!.headers['x-piste-pin']).toBeUndefined();
  });

  it('feeds the clock offset from every snapshot it receives', async () => {
    const { api, clockOffset } = make(60_000);
    await api.getSnapshot('p1');
    expect(clockOffset.offsetMs).toBe(60_000);
  });

  it('maps HTTP failures to a discriminated union', async () => {
    const call = (fetch: FetchLike) =>
      new ApiClient({ fetch, now: () => 0 }).submitEvents('p1', '1234', []);

    expect(await call(respond(401, { error: 'unauthorized' }))).toEqual({ ok: false, error: { kind: 'unauthorized' } });
    expect(await call(respond(404, { error: 'unknown-piste' }))).toEqual({ ok: false, error: { kind: 'unknown-piste' } });
    expect(await call(respond(409, { error: 'no-bout' }))).toEqual({ ok: false, error: { kind: 'no-bout' } });
    expect(await call(respond(400, { error: 'invalid-request' }))).toEqual({ ok: false, error: { kind: 'invalid-request' } });
    expect(await call(respond(503))).toEqual({ ok: false, error: { kind: 'server', status: 503 } });
  });

  it('maps 422 to the failing index and domain error', async () => {
    const body = { index: 2, error: { type: 'clock-not-running' } };
    expect(await new ApiClient({ fetch: respond(422, body), now: () => 0 }).submitEvents('p1', '1', [])).toEqual({
      ok: false,
      error: { kind: 'rejected', index: 2, error: { type: 'clock-not-running' } },
    });
  });

  it('maps 429 with Retry-After seconds to milliseconds', async () => {
    const api = new ApiClient({ fetch: respond(429, { error: 'too-many-attempts' }, { 'retry-after': '12' }), now: () => 0 });
    expect(await api.submitEvents('p1', '1', [])).toEqual({
      ok: false,
      error: { kind: 'rate-limited', retryAfterMs: 12_000 },
    });
  });

  it('uses a conservative wait when Retry-After is missing or invalid', async () => {
    const api = new ApiClient({ fetch: respond(429), now: () => 0 });
    const result = await api.submitEvents('p1', '1', []);
    expect(result).toEqual({ ok: false, error: { kind: 'rate-limited', retryAfterMs: 60_000 } });
  });

  it('never throws: network errors and malformed bodies become values', async () => {
    const dead: FetchLike = async () => {
      throw new TypeError('Failed to fetch');
    };
    const garbage: FetchLike = async () => new Response('<html>', { status: 200 });
    expect(await new ApiClient({ fetch: dead, now: () => 0 }).getSnapshot('p1')).toEqual({
      ok: false,
      error: { kind: 'network' },
    });
    expect(await new ApiClient({ fetch: garbage, now: () => 0 }).getSnapshot('p1')).toEqual({
      ok: false,
      error: { kind: 'server', status: 200 },
    });
  });

  describe('admin endpoints', () => {
    const rows = [{ id: 'p1', pin: '1111' }];
    const recording = (status: number, body: unknown) => {
      const calls: { path: string; init?: RequestInit }[] = [];
      const fetch: FetchLike = async (path, init) => {
        calls.push({ path, init });
        return Response.json(body, { status });
      };
      return { calls, api: new ApiClient({ fetch, now: () => 0 }) };
    };

    it('lists pistes with the admin PIN header', async () => {
      const { api, calls } = recording(200, rows);
      expect(await api.listAdminPistes('9999')).toEqual({ ok: true, value: rows });
      expect(calls[0]!.path).toBe('/admin/pistes');
      expect(calls[0]!.init?.method).toBe('GET');
      expect(calls[0]!.init?.headers).toMatchObject({ 'x-admin-pin': '9999' });
    });

    it('creates pistes by posting the count', async () => {
      const { api, calls } = recording(201, rows);
      expect(await api.createAdminPistes('9999', 3)).toEqual({ ok: true, value: rows });
      expect(calls[0]!.init?.method).toBe('POST');
      expect(JSON.parse(String(calls[0]!.init?.body))).toEqual({ count: 3 });
      expect(calls[0]!.init?.headers).toMatchObject({ 'x-admin-pin': '9999' });
    });

    it('maps 400, 401 and network failures', async () => {
      expect(await recording(400, { error: 'invalid-request' }).api.createAdminPistes('1', 0)).toEqual({
        ok: false,
        error: { kind: 'invalid-request' },
      });
      expect(await recording(401, { error: 'unauthorized' }).api.listAdminPistes('1')).toEqual({
        ok: false,
        error: { kind: 'unauthorized' },
      });
      const dead: FetchLike = async () => {
        throw new TypeError('Failed to fetch');
      };
      expect(await new ApiClient({ fetch: dead, now: () => 0 }).listAdminPistes('1')).toEqual({
        ok: false,
        error: { kind: 'network' },
      });
    });
  });
});
