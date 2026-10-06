export type Weapon = 'foil' | 'epee' | 'sabre';
export type Side = 'left' | 'right';

export interface RulesOptions {
  periods?: 1 | 2 | 3;
  touchLimit?: number;
  periodDurationMs?: number;
  breakDurationMs?: number;
}

export interface Rules {
  readonly weapon: Weapon;
  readonly periods: 1 | 2 | 3;
  readonly touchLimit: number;
  readonly periodDurationMs: number;
  readonly breakDurationMs: number;
  /** Sabre only: a fencer reaching this score triggers a mid-bout break. */
  readonly midBoutBreakAt: number | null;
  /** Sudden-death extra period length. */
  readonly extraPeriodDurationMs: number;
  readonly doubleTouchAllowed: boolean;
}

export const DEFAULT_PERIODS = 3;
export const DEFAULT_TOUCH_LIMIT = 15;
export const DEFAULT_PERIOD_DURATION_MS = 180_000;
export const DEFAULT_BREAK_DURATION_MS = 60_000;
export const EXTRA_PERIOD_DURATION_MS = 60_000;
export const SABRE_MID_BOUT_BREAK_AT = 8;

function assertPositiveInteger(name: string, value: number): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive integer, got ${value}`);
  }
}

/** Builds the rules for a bout. Throws RangeError on invalid configuration (programmer error). */
export function createRules(weapon: Weapon, options: RulesOptions = {}): Rules {
  const periods = options.periods ?? DEFAULT_PERIODS;
  const touchLimit = options.touchLimit ?? DEFAULT_TOUCH_LIMIT;
  const periodDurationMs = options.periodDurationMs ?? DEFAULT_PERIOD_DURATION_MS;
  const breakDurationMs = options.breakDurationMs ?? DEFAULT_BREAK_DURATION_MS;

  if (periods !== 1 && periods !== 2 && periods !== 3) {
    throw new RangeError(`periods must be 1, 2 or 3, got ${periods}`);
  }
  assertPositiveInteger('touchLimit', touchLimit);
  assertPositiveInteger('periodDurationMs', periodDurationMs);
  assertPositiveInteger('breakDurationMs', breakDurationMs);

  return {
    weapon,
    periods,
    touchLimit,
    periodDurationMs,
    breakDurationMs,
    midBoutBreakAt:
      weapon === 'sabre' && touchLimit === DEFAULT_TOUCH_LIMIT ? SABRE_MID_BOUT_BREAK_AT : null,
    extraPeriodDurationMs: EXTRA_PERIOD_DURATION_MS,
    doubleTouchAllowed: weapon === 'epee',
  };
}
