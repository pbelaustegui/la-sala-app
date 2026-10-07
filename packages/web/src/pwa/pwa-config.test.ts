// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PWA_OPTIONS } from '../../pwa.config';

const root = join(__dirname, '..', '..');
const manifest = PWA_OPTIONS.manifest as Exclude<typeof PWA_OPTIONS.manifest, false | undefined>;
const workbox = PWA_OPTIONS.workbox ?? {};

/** Width and height from the PNG header, so a wrong or corrupt icon fails the test. */
function pngSize(path: string): { width: number; height: number } {
  const bytes = readFileSync(path);
  expect(bytes.subarray(1, 4).toString('latin1')).toBe('PNG');
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

describe('web app manifest', () => {
  it('identifies the app and opens it like a native one', () => {
    expect(manifest).toMatchObject({
      name: 'La Sala',
      short_name: 'La Sala',
      lang: 'es',
      display: 'standalone',
      orientation: 'portrait',
      // The installed app is the judge's: it opens the judge entry, not the public board.
      start_url: '/#/judge',
      scope: '/',
    });
    expect(manifest.theme_color).toMatch(/^#[0-9a-f]{6}$/i);
    expect(manifest.background_color).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('declares 192, 512 and a maskable icon that exist with the declared size', () => {
    const icons = manifest.icons ?? [];
    const find = (sizes: string, purpose?: string) =>
      icons.find((icon) => icon.sizes === sizes && icon.purpose === purpose);
    for (const icon of [find('192x192'), find('512x512'), find('512x512', 'maskable')]) {
      expect(icon, 'icon missing from the manifest').toBeDefined();
      const path = join(root, 'public', icon!.src);
      expect(existsSync(path), icon!.src).toBe(true);
      const [width, height] = icon!.sizes!.split('x').map(Number);
      expect(pngSize(path)).toEqual({ width, height });
    }
  });

  it('ships the Apple touch icon at 180x180', () => {
    expect(pngSize(join(root, 'public', 'apple-touch-icon-180x180.png'))).toEqual({ width: 180, height: 180 });
  });
});

describe('service worker policy', () => {
  it('never reloads the page by itself: updates wait for the judge or the next launch', () => {
    expect(PWA_OPTIONS.registerType).toBe('prompt');
    expect(workbox.skipWaiting).not.toBe(true);
    expect(workbox.clientsClaim).not.toBe(true);
  });

  it('precaches the app shell so it loads offline', () => {
    expect(workbox.globPatterns).toEqual(expect.arrayContaining([expect.stringContaining('js'), expect.stringContaining('html')]));
    expect(workbox.navigateFallback).toBe('index.html');
    expect(workbox.cleanupOutdatedCaches).toBe(true);
  });

  it('never caches API requests: no runtime caching at all and API navigations bypass the shell', () => {
    expect(workbox.runtimeCaching).toBeUndefined();
    const denylist = workbox.navigateFallbackDenylist ?? [];
    for (const path of ['/pistes', '/pistes/1/state', '/pistes/1/stream', '/admin/pistes', '/health']) {
      expect(
        denylist.some((pattern) => pattern.test(path)),
        path,
      ).toBe(true);
    }
    expect(denylist.some((pattern) => pattern.test('/judge/p1'))).toBe(false);
    expect(denylist.some((pattern) => pattern.test('/pistes/stream'))).toBe(true);
  });
});

describe('index.html', () => {
  const html = readFileSync(join(root, 'index.html'), 'utf8');

  it('sets the viewport so the app fills the phone screen, notch included', () => {
    expect(html).toContain('width=device-width');
    expect(html).toContain('viewport-fit=cover');
  });

  it('opts into standalone mode on iOS with the touch icon', () => {
    expect(html).toContain('name="apple-mobile-web-app-capable" content="yes"');
    expect(html).toContain('name="mobile-web-app-capable" content="yes"');
    expect(html).toContain('name="apple-mobile-web-app-title" content="La Sala"');
    expect(html).toContain('name="apple-mobile-web-app-status-bar-style"');
    expect(html).toContain('rel="apple-touch-icon" href="/apple-touch-icon-180x180.png"');
  });
});
