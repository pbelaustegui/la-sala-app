import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { loadConfig } from './config';

const PIN = 'organizer-secret';

describe('loadConfig', () => {
  it('refuses to start without ADMIN_PIN', () => {
    expect(() => loadConfig({})).toThrow(/ADMIN_PIN/);
    expect(() => loadConfig({ ADMIN_PIN: '' })).toThrow(/ADMIN_PIN/);
    expect(() => loadConfig({ ADMIN_PIN: '   ' })).toThrow(/ADMIN_PIN/);
  });

  it('applies defaults', () => {
    expect(loadConfig({ ADMIN_PIN: PIN })).toEqual({
      adminPin: PIN,
      port: 3000,
      dbPath: 'la-sala.sqlite',
    });
  });

  it('reads PORT and DB_PATH', () => {
    expect(loadConfig({ ADMIN_PIN: PIN, PORT: '8080', DB_PATH: '/data/x.db' })).toEqual({
      adminPin: PIN,
      port: 8080,
      dbPath: '/data/x.db',
    });
  });

  it.each(['abc', '0', '70000', '-1', '80.5'])('rejects invalid PORT %s', (port) => {
    expect(() => loadConfig({ ADMIN_PIN: PIN, PORT: port })).toThrow(/PORT/);
  });

  it('requires ADMIN_PIN of at least 12 characters, counted after trimming', () => {
    expect(() => loadConfig({ ADMIN_PIN: '12345678901' })).toThrow(/ADMIN_PIN.*12/);
    expect(() => loadConfig({ ADMIN_PIN: '  12345678901  ' })).toThrow(/ADMIN_PIN.*12/);
    expect(loadConfig({ ADMIN_PIN: '123456789012' }).adminPin).toBe('123456789012');
  });

  it('never includes the admin pin in error messages', () => {
    expect.assertions(2);
    for (const env of [{ ADMIN_PIN: 'topsecret' }, { ADMIN_PIN: 'topsecret-long-enough', PORT: 'abc' }]) {
      try {
        loadConfig(env);
      } catch (error) {
        expect(String(error)).not.toContain('topsecret');
      }
    }
  });
});

describe('loadConfig WEB_DIST', () => {
  const base = mkdtempSync(join(tmpdir(), 'la-sala-config-'));
  afterAll(() => rmSync(base, { recursive: true, force: true }));

  const makeDist = (name: string, withIndex = true) => {
    const dir = join(base, name);
    mkdirSync(dir, { recursive: true });
    if (withIndex) writeFileSync(join(dir, 'index.html'), '<html></html>');
    return dir;
  };

  it('does not serve the web app by default', () => {
    expect(loadConfig({ ADMIN_PIN: PIN }, base).webDist).toBeUndefined();
    expect(loadConfig({ ADMIN_PIN: PIN, WEB_DIST: '  ' }, base).webDist).toBeUndefined();
  });

  it('resolves a relative WEB_DIST against the working directory', () => {
    const dist = makeDist('relative');
    expect(loadConfig({ ADMIN_PIN: PIN, WEB_DIST: 'relative' }, base).webDist).toBe(dist);
  });

  it('accepts an absolute WEB_DIST', () => {
    const dist = makeDist('absolute');
    expect(loadConfig({ ADMIN_PIN: PIN, WEB_DIST: dist }, '/somewhere/else').webDist).toBe(dist);
  });

  it('fails at startup with a clear error when WEB_DIST does not exist', () => {
    expect(() => loadConfig({ ADMIN_PIN: PIN, WEB_DIST: 'nope' }, base)).toThrow(/WEB_DIST.*nope.*does not exist/s);
    expect(() => loadConfig({ ADMIN_PIN: PIN, WEB_DIST: 'nope' }, base)).toThrow(/npm run build -w packages\/web/);
  });

  it('fails when WEB_DIST has no index.html (the web app was not built)', () => {
    makeDist('empty', false);
    expect(() => loadConfig({ ADMIN_PIN: PIN, WEB_DIST: 'empty' }, base)).toThrow(/WEB_DIST.*index\.html/s);
  });

  it('does not leak the admin PIN in WEB_DIST errors', () => {
    expect(() => loadConfig({ ADMIN_PIN: PIN, WEB_DIST: 'nope' }, base)).not.toThrow(new RegExp(PIN));
  });
});
