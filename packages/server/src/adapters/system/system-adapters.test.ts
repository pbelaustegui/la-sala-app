import { describe, expect, it } from 'vitest';
import { RandomPinGenerator } from './random-pin-generator';
import { SystemClock } from './system-clock';

describe('RandomPinGenerator', () => {
  it('produces 4-digit pins, including leading zeros', () => {
    const generator = new RandomPinGenerator();
    for (let i = 0; i < 500; i++) expect(generator.generate()).toMatch(/^\d{4}$/);
  });

  it('pads small numbers', () => {
    expect(new RandomPinGenerator(() => 7).generate()).toBe('0007');
  });

  it('is not constant', () => {
    const generator = new RandomPinGenerator();
    expect(new Set(Array.from({ length: 50 }, () => generator.generate())).size).toBeGreaterThan(1);
  });
});

describe('SystemClock', () => {
  it('returns epoch milliseconds', () => {
    const before = Date.now();
    const now = new SystemClock().now();
    expect(now).toBeGreaterThanOrEqual(before);
    expect(now).toBeLessThanOrEqual(Date.now());
  });
});
