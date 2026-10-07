import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { compose } from './compose';

describe('compose with sqlite', () => {
  const dir = mkdtempSync(join(tmpdir(), 'la-sala-compose-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('runs a bout end to end and survives a restart', async () => {
    const config = { adminPin: 'admin-secret', port: 0, dbPath: join(dir, 'e2e.sqlite') };
    const json = (body: unknown, headers: Record<string, string>) => ({
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
    });

    const first = compose(config);
    const created = await first.app.request('/admin/pistes', json({ count: 1 }, { 'x-admin-pin': 'admin-secret' }));
    const [piste] = (await created.json()) as { id: string; pin: string }[];
    expect(piste?.pin).toMatch(/^\d{4}$/);
    const judge = { 'x-piste-pin': piste!.pin };
    await first.app.request('/pistes/1/bout', json({ weapon: 'foil', left: 'Ana', right: 'Bea' }, judge));
    const applied = await first.app.request(
      '/pistes/1/events',
      json({ events: [{ id: 'a', type: 'clock-started', at: Date.now() }, { id: 'b', type: 'touch-scored', side: 'right', at: Date.now() }] }, judge),
    );
    expect(applied.status).toBe(200);
    first.close();

    const second = compose(config);
    const state = (await (await second.app.request('/pistes/1/state')).json()) as any;
    expect(state.bout.score).toEqual({ left: 0, right: 1 });
    expect(state.fencers).toEqual({ left: 'Ana', right: 'Bea' });
    second.close();
  });

  it('serves the built web app next to the API when webDist is configured', async () => {
    const webDist = join(dir, 'web');
    mkdirSync(webDist);
    writeFileSync(join(webDist, 'index.html'), '<title>La Sala</title>');
    const composed = compose({ adminPin: 'admin-secret', port: 0, dbPath: join(dir, 'web.sqlite'), webDist });

    expect(await (await composed.app.request('/')).text()).toContain('La Sala');
    expect(await (await composed.app.request('/health')).json()).toEqual({ status: 'ok' });
    composed.close();
  });
});
