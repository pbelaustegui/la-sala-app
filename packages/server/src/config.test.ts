import { describe, expect, it } from 'vitest';
import { loadConfig } from './config';

describe('loadConfig', () => {
  it('refuses to start without ADMIN_PIN', () => {
    expect(() => loadConfig({})).toThrow(/ADMIN_PIN/);
    expect(() => loadConfig({ ADMIN_PIN: '' })).toThrow(/ADMIN_PIN/);
    expect(() => loadConfig({ ADMIN_PIN: '   ' })).toThrow(/ADMIN_PIN/);
  });

  it('applies defaults', () => {
    expect(loadConfig({ ADMIN_PIN: 'secret' })).toEqual({
      adminPin: 'secret',
      port: 3000,
      dbPath: 'la-sala.sqlite',
    });
  });

  it('reads PORT and DB_PATH', () => {
    expect(loadConfig({ ADMIN_PIN: 'secret', PORT: '8080', DB_PATH: '/data/x.db' })).toEqual({
      adminPin: 'secret',
      port: 8080,
      dbPath: '/data/x.db',
    });
  });

  it.each(['abc', '0', '70000', '-1', '80.5'])('rejects invalid PORT %s', (port) => {
    expect(() => loadConfig({ ADMIN_PIN: 'secret', PORT: port })).toThrow(/PORT/);
  });

  it('never includes the admin pin in error messages', () => {
    try {
      loadConfig({ ADMIN_PIN: 'topsecret', PORT: 'abc' });
    } catch (error) {
      expect(String(error)).not.toContain('topsecret');
    }
  });
});
