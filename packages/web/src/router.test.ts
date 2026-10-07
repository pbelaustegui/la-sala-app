import { describe, expect, it } from 'vitest';
import { hrefTo, parseRoute } from './router';

describe('parseRoute', () => {
  it('maps the empty hash and #/ to the public board', () => {
    expect(parseRoute('')).toEqual({ name: 'board' });
    expect(parseRoute('#')).toEqual({ name: 'board' });
    expect(parseRoute('#/')).toEqual({ name: 'board' });
  });

  it('maps #/piste/:id to the piste detail', () => {
    expect(parseRoute('#/piste/3')).toEqual({ name: 'piste', pisteId: '3' });
    expect(parseRoute('#/piste/pista%201/')).toEqual({ name: 'piste', pisteId: 'pista 1' });
  });

  it('maps #/judge to the judge piste list', () => {
    expect(parseRoute('#/judge')).toEqual({ name: 'judge-list' });
    expect(parseRoute('#/judge/')).toEqual({ name: 'judge-list' });
  });

  it('maps #/judge/:pisteId to the judge route', () => {
    expect(parseRoute('#/judge/p1')).toEqual({ name: 'judge', pisteId: 'p1' });
  });

  it('decodes the piste id and ignores a trailing slash', () => {
    expect(parseRoute('#/judge/pista%201/')).toEqual({ name: 'judge', pisteId: 'pista 1' });
  });

  it('falls back to not-found for unknown paths and extra segments', () => {
    expect(parseRoute('#/nope')).toEqual({ name: 'not-found' });
    expect(parseRoute('#/judge/a/b')).toEqual({ name: 'not-found' });
    expect(parseRoute('#/piste')).toEqual({ name: 'not-found' });
    expect(parseRoute('#/piste/a/b')).toEqual({ name: 'not-found' });
  });

  it('does not throw on malformed percent-encoding', () => {
    expect(parseRoute('#/judge/%E0%A4%A')).toEqual({ name: 'not-found' });
    expect(parseRoute('#/piste/%E0%A4%A')).toEqual({ name: 'not-found' });
  });
});

describe('hrefTo', () => {
  it('builds the fixed hashes', () => {
    expect(hrefTo({ name: 'board' })).toBe('#/');
    expect(hrefTo({ name: 'judge-list' })).toBe('#/judge');
    expect(hrefTo({ name: 'not-found' })).toBe('#/');
  });

  it('builds hashes that parse back to the same route', () => {
    for (const route of [
      { name: 'judge', pisteId: 'pista 1' },
      { name: 'piste', pisteId: 'a/b' },
    ] as const) {
      expect(parseRoute(hrefTo(route))).toEqual(route);
    }
  });
});
