import { describe, expect, it } from 'vitest';
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
