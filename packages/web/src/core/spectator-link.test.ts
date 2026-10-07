import { describe, expect, it } from 'vitest';
import { spectatorLink } from './spectator-link';

describe('spectatorLink', () => {
  it('points at the public board of the given origin', () => {
    expect(spectatorLink('https://example.trycloudflare.com')).toBe('https://example.trycloudflare.com/#/');
  });

  it('keeps a port and ignores a trailing slash', () => {
    expect(spectatorLink('http://192.168.1.5:3000/')).toBe('http://192.168.1.5:3000/#/');
  });
});
