import { beforeEach, describe, expect, it } from 'vitest';
import { MemoryPisteRepository } from '../memory/memory-piste-repository';
import { FakeClock, SequentialPinGenerator } from '../../testing/fakes';
import { createApp } from './app';

const ADMIN = 'admin-secret';

function setup() {
  const repository = new MemoryPisteRepository();
  const app = createApp({
    adminPin: ADMIN,
    repository,
    pinGenerator: new SequentialPinGenerator(),
    clock: new FakeClock(),
  });
  return { app, repository };
}

const post = (app: ReturnType<typeof setup>['app'], path: string, body: unknown, headers: Record<string, string> = {}) =>
  app.request(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });

describe('GET /health', () => {
  it('answers ok without auth', async () => {
    const { app } = setup();
    const res = await app.request('/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok' });
  });
});

describe('admin pistes', () => {
  let ctx: ReturnType<typeof setup>;
  beforeEach(() => {
    ctx = setup();
  });

  it('rejects requests without the admin pin', async () => {
    expect((await post(ctx.app, '/admin/pistes', { count: 2 })).status).toBe(401);
    expect((await ctx.app.request('/admin/pistes')).status).toBe(401);
  });

  it('rejects a wrong admin pin and does not echo it', async () => {
    const res = await post(ctx.app, '/admin/pistes', { count: 2 }, { 'x-admin-pin': 'nope' });
    expect(res.status).toBe(401);
    expect(await res.text()).not.toContain('nope');
  });

  it('rejects a piste pin used as admin pin', async () => {
    await post(ctx.app, '/admin/pistes', { count: 1 }, { 'x-admin-pin': ADMIN });
    const res = await ctx.app.request('/admin/pistes', { headers: { 'x-admin-pin': '1000' } });
    expect(res.status).toBe(401);
  });

  it('creates pistes with unique 4-digit pins', async () => {
    const res = await post(ctx.app, '/admin/pistes', { count: 3 }, { 'x-admin-pin': ADMIN });
    expect(res.status).toBe(201);
    const pistes = (await res.json()) as { id: string; pin: string }[];
    expect(pistes.map((p) => p.id)).toEqual(['1', '2', '3']);
    for (const p of pistes) expect(p.pin).toMatch(/^\d{4}$/);
    expect(new Set(pistes.map((p) => p.pin)).size).toBe(3);
  });

  it('retries when the generator returns a duplicate pin', async () => {
    const app = createApp({
      adminPin: ADMIN,
      repository: new MemoryPisteRepository(),
      pinGenerator: new SequentialPinGenerator(['5555', '5555', '6666']),
      clock: new FakeClock(),
    });
    const res = await post(app, '/admin/pistes', { count: 2 }, { 'x-admin-pin': ADMIN });
    const pistes = (await res.json()) as { id: string; pin: string }[];
    expect(pistes.map((p) => p.pin)).toEqual(['5555', '6666']);
  });

  it('lists the pistes for the admin', async () => {
    await post(ctx.app, '/admin/pistes', { count: 2 }, { 'x-admin-pin': ADMIN });
    const res = await ctx.app.request('/admin/pistes', { headers: { 'x-admin-pin': ADMIN } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([
      { id: '1', pin: '1000' },
      { id: '2', pin: '1001' },
    ]);
  });

  it('replaces the existing pistes', async () => {
    await post(ctx.app, '/admin/pistes', { count: 3 }, { 'x-admin-pin': ADMIN });
    await post(ctx.app, '/admin/pistes', { count: 1 }, { 'x-admin-pin': ADMIN });
    const res = await ctx.app.request('/admin/pistes', { headers: { 'x-admin-pin': ADMIN } });
    expect(((await res.json()) as unknown[]).length).toBe(1);
  });

  it.each([0, -1, 1.5, 101, '3', null])('rejects invalid count %j with 400', async (count) => {
    const res = await post(ctx.app, '/admin/pistes', { count }, { 'x-admin-pin': ADMIN });
    expect(res.status).toBe(400);
  });

  it('rejects malformed JSON with 400', async () => {
    const res = await ctx.app.request('/admin/pistes', {
      method: 'POST',
      headers: { 'x-admin-pin': ADMIN, 'content-type': 'application/json' },
      body: '{not json',
    });
    expect(res.status).toBe(400);
  });
});
