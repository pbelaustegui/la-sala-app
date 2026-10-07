import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FakeClock, SequentialPinGenerator } from '../../testing/fakes';
import { MemoryPisteRepository } from '../memory/memory-piste-repository';
import { createApp } from './app';

const INDEX = '<!doctype html><title>La Sala</title><div id="app"></div>';
const SECRET = 'top-secret-outside-the-web-root';

describe('serving the built web app', () => {
  const base = mkdtempSync(join(tmpdir(), 'la-sala-web-'));
  const dist = join(base, 'dist');
  afterAll(() => rmSync(base, { recursive: true, force: true }));

  beforeAll(() => {
    mkdirSync(join(dist, 'assets'), { recursive: true });
    mkdirSync(join(dist, 'icons'));
    writeFileSync(join(dist, 'index.html'), INDEX);
    writeFileSync(join(dist, 'sw.js'), 'self.addEventListener("fetch", () => {});');
    writeFileSync(join(dist, 'manifest.webmanifest'), '{"name":"La Sala"}');
    writeFileSync(join(dist, 'assets', 'index-abc123.js'), 'console.log("app");');
    writeFileSync(join(dist, 'assets', 'index-abc123.css'), 'body{margin:0}');
    writeFileSync(join(dist, 'icons', 'icon-192.png'), 'png');
    writeFileSync(join(base, 'secret.txt'), SECRET);
  });

  function build(webDist: string | null = dist) {
    return createApp({
      adminPin: 'admin-secret',
      repository: new MemoryPisteRepository(),
      pinGenerator: new SequentialPinGenerator(),
      clock: new FakeClock(),
      webDist: webDist ?? undefined,
    });
  }

  it('serves index.html at the root and never caches it', async () => {
    const res = await build().request('/');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    expect(res.headers.get('cache-control')).toBe('no-cache');
    expect(await res.text()).toBe(INDEX);
  });

  it('never caches the service worker or the manifest, so updates are noticed', async () => {
    const app = build();
    const sw = await app.request('/sw.js');
    expect(sw.status).toBe(200);
    expect(sw.headers.get('content-type')).toContain('javascript');
    expect(sw.headers.get('cache-control')).toBe('no-cache');

    const manifest = await app.request('/manifest.webmanifest');
    expect(manifest.status).toBe(200);
    expect(manifest.headers.get('content-type')).toContain('manifest+json');
    expect(manifest.headers.get('cache-control')).toBe('no-cache');
  });

  it('caches hashed assets for a year as immutable', async () => {
    const app = build();
    for (const [path, type] of [
      ['/assets/index-abc123.js', 'javascript'],
      ['/assets/index-abc123.css', 'text/css'],
    ] as const) {
      const res = await app.request(path);
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain(type);
      expect(res.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
    }
  });

  it('revalidates unhashed files such as icons', async () => {
    const res = await build().request('/icons/icon-192.png');
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-cache');
  });

  it('answers HEAD for files', async () => {
    const res = await build().request('/sw.js', { method: 'HEAD' });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('');
  });

  it('falls back to index.html for app routes without a file extension', async () => {
    const res = await build().request('/judge/p1');
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(INDEX);
    expect(res.headers.get('cache-control')).toBe('no-cache');
  });

  it('answers 404 for a missing file instead of HTML', async () => {
    const res = await build().request('/assets/missing.js');
    expect(res.status).toBe(404);
    expect(await res.text()).not.toContain('La Sala');
  });

  describe('does not shadow the API', () => {
    it('keeps /health, /pistes and /admin answering as before', async () => {
      const app = build();
      expect(await (await app.request('/health')).json()).toEqual({ status: 'ok' });
      expect(await (await app.request('/pistes')).json()).toEqual([]);
      expect((await app.request('/admin/pistes')).status).toBe(401);
    });

    it('answers unknown API paths with a JSON 404, never the app shell', async () => {
      const app = build();
      for (const path of ['/pistes/zzz/state', '/pistes/zzz/unknown', '/health/deep']) {
        const res = await app.request(path);
        expect(res.status).toBe(404);
        expect(await res.text()).not.toContain('La Sala');
      }
    });

    it('keeps /admin behind the organizer PIN even for unknown paths', async () => {
      const res = await build().request('/admin/nothing');
      expect(res.status).toBe(401);
      expect(await res.text()).not.toContain('La Sala');
    });

    it('only falls back for GET and HEAD', async () => {
      const res = await build().request('/judge/p1', { method: 'POST' });
      expect(res.status).toBe(404);
    });

    it('keeps POST /pistes/:id/bout behind the judge PIN', async () => {
      const res = await build().request('/pistes/1/bout', { method: 'POST' });
      expect(res.status).toBe(404);
      expect((await res.json()) as unknown).toEqual({ error: 'unknown-piste' });
    });
  });

  it('cannot read files outside the web root', async () => {
    const app = build();
    for (const path of ['/../secret.txt', '/%2e%2e/secret.txt', '/..%2fsecret.txt', '/assets/../../secret.txt']) {
      const res = await app.request(path);
      expect(await res.text()).not.toContain(SECRET);
    }
  });

  it('serves nothing when no web root is configured', async () => {
    const app = build(null);
    expect((await app.request('/')).status).toBe(404);
    expect((await app.request('/health')).status).toBe(200);
  });
});
