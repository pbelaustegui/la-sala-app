import type { Rules, Side } from './rules';

export type FinishReason = 'touch-limit' | 'time' | 'priority' | 'exclusion';

export type Phase =
  | { readonly kind: 'scheduled' }
  | { readonly kind: 'fencing'; readonly period: number }
  | {
      readonly kind: 'break';
      readonly breakKind: 'period' | 'mid-bout';
      /** Period just ended (period break) or interrupted (mid-bout break). */
      readonly period: number;
      readonly endsAt: number;
      /** Mid-bout only: time left in the interrupted period, restored when the break ends. */
      readonly resumeRemainingMs: number | null;
    }
  | { readonly kind: 'priority-draw' }
  | { readonly kind: 'extra-period' }
  | { readonly kind: 'finished'; readonly winner: Side; readonly reason: FinishReason };

export type PhaseKind = Phase['kind'];

/** The fencing clock. Remaining time at `t` is derived from timestamps, never from a timer. */
export interface Clock {
  readonly remainingMs: number;
  /** Timestamp the clock was last started at, or null when stopped. */
  readonly runningSince: number | null;
}

export type Card = 'yellow' | 'red' | 'black';

export interface CardRecord {
  readonly side: Side;
  readonly card: Card;
  readonly at: number;
}

export interface BoutState {
  readonly rules: Rules;
  readonly phase: Phase;
  readonly score: Readonly<Record<Side, number>>;
  readonly clock: Clock;
  /** Side holding priority in sudden death, once drawn. */
  readonly priority: Side | null;
  readonly cards: readonly CardRecord[];
  /** Whether the sabre mid-bout break already happened. */
  readonly midBoutBreakTaken: boolean;
  /** Timestamp of the last applied event; used to reject time going backwards. */
  readonly lastAt: number | null;
}

export function createBout(rules: Rules): BoutState {
  return {
    rules,
    phase: { kind: 'scheduled' },
    score: { left: 0, right: 0 },
    clock: { remainingMs: rules.periodDurationMs, runningSince: null },
    priority: null,
    cards: [],
    midBoutBreakTaken: false,
    lastAt: null,
  };
}
