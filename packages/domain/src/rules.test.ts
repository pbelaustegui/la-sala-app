import { describe, expect, it } from 'vitest';
import { createRules } from './rules';

describe('createRules', () => {
  it('uses the default format: 3 periods x 3 min, 1 min break, 15 touches', () => {
    expect(createRules('foil')).toEqual({
      weapon: 'foil',
      periods: 3,
      periodDurationMs: 180_000,
      breakDurationMs: 60_000,
      touchLimit: 15,
      midBoutBreakAt: null,
      extraPeriodDurationMs: 60_000,
      doubleTouchAllowed: false,
    });
  });

  it('allows double touches only in epee', () => {
    expect(createRules('epee').doubleTouchAllowed).toBe(true);
    expect(createRules('foil').doubleTouchAllowed).toBe(false);
    expect(createRules('sabre').doubleTouchAllowed).toBe(false);
  });

  it('gives sabre a mid-bout break at 8 touches with the 15-touch limit', () => {
    expect(createRules('sabre').midBoutBreakAt).toBe(8);
  });

  it('gives sabre no mid-bout break when the touch limit is not 15', () => {
    expect(createRules('sabre', { touchLimit: 5 }).midBoutBreakAt).toBeNull();
  });

  it('never gives foil or epee a mid-bout break', () => {
    expect(createRules('epee').midBoutBreakAt).toBeNull();
    expect(createRules('foil', { touchLimit: 15 }).midBoutBreakAt).toBeNull();
  });

  it('applies pool-style overrides', () => {
    const rules = createRules('epee', { periods: 1, touchLimit: 5 });
    expect(rules.periods).toBe(1);
    expect(rules.touchLimit).toBe(5);
    expect(rules.periodDurationMs).toBe(180_000);
  });

  it('applies custom durations', () => {
    const rules = createRules('foil', { periodDurationMs: 120_000, breakDurationMs: 30_000 });
    expect(rules.periodDurationMs).toBe(120_000);
    expect(rules.breakDurationMs).toBe(30_000);
  });

  it('rejects invalid options', () => {
    expect(() => createRules('foil', { touchLimit: 0 })).toThrow(RangeError);
    expect(() => createRules('foil', { touchLimit: 2.5 })).toThrow(RangeError);
    expect(() => createRules('foil', { periodDurationMs: 0 })).toThrow(RangeError);
    expect(() => createRules('foil', { breakDurationMs: -1 })).toThrow(RangeError);
    // @ts-expect-error periods must be 1, 2 or 3
    expect(() => createRules('foil', { periods: 4 })).toThrow(RangeError);
  });
});
