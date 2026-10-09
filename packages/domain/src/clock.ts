import type { BoutState, Clock, Phase } from './bout';
import type { Side } from './rules';

/** Time left on the clock at timestamp `at`. */
export function remainingAt(clock: Clock, at: number): number {
  if (clock.runningSince === null) return clock.remainingMs;
  return Math.max(0, clock.remainingMs - (at - clock.runningSince));
}

export function startClock(clock: Clock, at: number): Clock {
  return { remainingMs: clock.remainingMs, runningSince: at };
}

export function stopClock(clock: Clock, at: number): Clock {
  return { remainingMs: remainingAt(clock, at), runningSince: null };
}

const STOPPED_EMPTY: Clock = { remainingMs: 0, runningSince: null };

function leader(state: BoutState): Side | null {
  const { left, right } = state.score;
  if (left === right) return null;
  return left > right ? 'left' : 'right';
}

/** Moment the running clock reaches zero, or null when stopped / not a timed phase. */
function expiryOf(state: BoutState): number | null {
  const { phase, clock } = state;
  if (phase.kind !== 'fencing' && phase.kind !== 'extra-period') return null;
  if (clock.runningSince === null) return null;
  return clock.runningSince + clock.remainingMs;
}

export function onClockExpired(state: BoutState, expiry: number): BoutState {
  const { phase, rules } = state;
  if (phase.kind === 'fencing') {
    if (phase.period < rules.periods) {
      const next: Phase = {
        kind: 'break',
        breakKind: 'period',
        period: phase.period,
        endsAt: expiry + rules.breakDurationMs,
        resumeRemainingMs: null,
      };
      return { ...state, phase: next, clock: STOPPED_EMPTY };
    }
    const winner = leader(state);
    return winner === null
      ? { ...state, phase: { kind: 'priority-draw' }, clock: STOPPED_EMPTY }
      : { ...state, phase: { kind: 'finished', winner, reason: 'time' }, clock: STOPPED_EMPTY };
  }
  // extra-period: no touch was scored, so the side holding priority wins.
  const winner = state.priority ?? 'left';
  return { ...state, phase: { kind: 'finished', winner, reason: 'priority' }, clock: STOPPED_EMPTY };
}

function onBreakEnded(state: BoutState): BoutState {
  const { phase, rules } = state;
  if (phase.kind !== 'break') return state;
  if (phase.breakKind === 'mid-bout') {
    return {
      ...state,
      phase: { kind: 'fencing', period: phase.period },
      clock: { remainingMs: phase.resumeRemainingMs ?? rules.periodDurationMs, runningSince: null },
    };
  }
  return {
    ...state,
    phase: { kind: 'fencing', period: phase.period + 1 },
    clock: { remainingMs: rules.periodDurationMs, runningSince: null },
  };
}

/**
 * Derives every time-driven transition (clock expiry, break end) up to `at`.
 * Pure and idempotent; returns the same reference when nothing changed.
 */
export function settle(state: BoutState, at: number): BoutState {
  let current = state;
  for (;;) {
    const expiry = expiryOf(current);
    if (expiry !== null && expiry <= at) {
      current = onClockExpired(current, expiry);
    } else if (current.phase.kind === 'break' && current.phase.endsAt <= at) {
      current = onBreakEnded(current);
    } else {
      return current;
    }
  }
}
