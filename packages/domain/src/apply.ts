import type { BoutState, PhaseKind } from './bout';
import { settle, startClock, stopClock } from './clock';

export type BoutEvent =
  | { readonly type: 'clock-started'; readonly at: number }
  | { readonly type: 'clock-stopped'; readonly at: number }
  | { readonly type: 'break-skipped'; readonly at: number };

export type DomainError =
  | { readonly type: 'invalid-phase'; readonly phase: PhaseKind; readonly event: BoutEvent['type'] }
  | { readonly type: 'clock-already-running' }
  | { readonly type: 'clock-not-running' }
  | { readonly type: 'time-went-backwards'; readonly lastAt: number; readonly at: number }
  | { readonly type: 'bout-finished' };

export type Result<T, E> =
  | { readonly ok: true; readonly state: T }
  | { readonly ok: false; readonly error: E };

const succeed = (state: BoutState): Result<BoutState, DomainError> => ({ ok: true, state });
const fail = (error: DomainError): Result<BoutState, DomainError> => ({ ok: false, error });

function invalidPhase(state: BoutState, event: BoutEvent): Result<BoutState, DomainError> {
  return fail({ type: 'invalid-phase', phase: state.phase.kind, event: event.type });
}

function startClockEvent(state: BoutState, at: number, event: BoutEvent) {
  const { phase, clock, rules } = state;
  if (phase.kind === 'scheduled') {
    return succeed({
      ...state,
      phase: { kind: 'fencing', period: 1 },
      clock: startClock({ remainingMs: rules.periodDurationMs, runningSince: null }, at),
    });
  }
  if (phase.kind !== 'fencing' && phase.kind !== 'extra-period') return invalidPhase(state, event);
  if (clock.runningSince !== null) return fail({ type: 'clock-already-running' });
  return succeed({ ...state, clock: startClock(clock, at) });
}

function stopClockEvent(state: BoutState, at: number, event: BoutEvent) {
  const { phase, clock } = state;
  if (phase.kind !== 'fencing' && phase.kind !== 'extra-period') return invalidPhase(state, event);
  if (clock.runningSince === null) return fail({ type: 'clock-not-running' });
  return succeed({ ...state, clock: stopClock(clock, at) });
}

function skipBreakEvent(state: BoutState, event: BoutEvent) {
  if (state.phase.kind !== 'break') return invalidPhase(state, event);
  // Settling at the end of the break lands in the next fencing phase with a stopped clock.
  return succeed(settle(state, state.phase.endsAt));
}

/** Pure reducer. Time-driven transitions are derived first via `settle`; errors are values. */
export function apply(state: BoutState, event: BoutEvent): Result<BoutState, DomainError> {
  if (state.lastAt !== null && event.at < state.lastAt) {
    return fail({ type: 'time-went-backwards', lastAt: state.lastAt, at: event.at });
  }
  const settled = settle(state, event.at);
  if (settled.phase.kind === 'finished') return fail({ type: 'bout-finished' });

  const result = reduce(settled, event);
  return result.ok ? succeed({ ...result.state, lastAt: event.at }) : result;
}

function reduce(state: BoutState, event: BoutEvent): Result<BoutState, DomainError> {
  switch (event.type) {
    case 'clock-started':
      return startClockEvent(state, event.at, event);
    case 'clock-stopped':
      return stopClockEvent(state, event.at, event);
    case 'break-skipped':
      return skipBreakEvent(state, event);
  }
}
