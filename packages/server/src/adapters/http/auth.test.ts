import { describe, expect, it } from 'vitest';
import { safeEqual } from './auth';

describe('safeEqual', () => {
  it('accepts equal strings', () => {
    expect(safeEqual('1234', '1234')).toBe(true);
  });

  it('rejects different strings of the same length', () => {
    expect(safeEqual('1234', '1235')).toBe(false);
  });

  it('rejects different lengths without throwing', () => {
    expect(safeEqual('123', '1234')).toBe(false);
    expect(safeEqual('', '1234')).toBe(false);
  });

  it('rejects undefined', () => {
    expect(safeEqual(undefined, '1234')).toBe(false);
  });
});
