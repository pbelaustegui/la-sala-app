import { describe, expect, it } from 'vitest';
import { hrefTo, parseRoute } from './router';

describe('parseRoute', () => {
  it('maps the empty hash and #/ to home', () => {
    expect(parseRoute('')).toEqual({ name: 'home' });
    expect(parseRoute('#')).toEqual({ name: 'home' });
    expect(parseRoute('#/')).toEqual({ name: 'home' });
  });

  it('maps #/judge/:pisteId to the judge route', () => {
    expect(parseRoute('#/judge/p1')).toEqual({ name: 'judge', pisteId: 'p1' });
  });

  it('decodes the piste id and ignores a trailing slash', () => {
    expect(parseRoute('#/judge/pista%201/')).toEqual({ name: 'judge', pisteId: 'pista 1' });
  });

  it('falls back to not-found for unknown paths and a missing piste id', () => {
    expect(parseRoute('#/nope')).toEqual({ name: 'not-found' });
    expect(parseRoute('#/judge')).toEqual({ name: 'not-found' });
    expect(parseRoute('#/judge/a/b')).toEqual({ name: 'not-found' });
  });

  it('does not throw on malformed percent-encoding', () => {
    expect(parseRoute('#/judge/%E0%A4%A')).toEqual({ name: 'not-found' });
  });
});

describe('hrefTo', () => {
  it('builds hashes that parse back to the same route', () => {
    expect(hrefTo({ name: 'home' })).toBe('#/');
    const route = { name: 'judge', pisteId: 'pista 1' } as const;
    expect(parseRoute(hrefTo(route))).toEqual(route);
  });
});
