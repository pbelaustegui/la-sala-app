import type { BoutState, Card, PhaseKind } from './bout';
import { settle, startClock, stopClock } from './clock';
import type { Side, Weapon } from './rules';
import { giveCard, scoreDoubleTouch, scoreTouch } from './scoring';

export type BoutEvent =
  | { readonly type: 'clock-started'; readonly at: number }
  | { readonly type: 'clock-stopped'; readonly at: number }
  | { readonly type: 'break-skipped'; readonly at: number }
  | { readonly type: 'touch-scored'; readonly side: Side; readonly at: number }
  | { readonly type: 'double-touch-scored'; readonly at: number }
  | { readonly type: 'priority-drawn'; readonly side: Side; readonly at: number }
  | { readonly type: 'card-given'; readonly side: Side; readonly card: Card; readonly at: number };

export type DomainError =
  | { readonly type: 'invalid-phase'; readonly phase: PhaseKind; readonly event: BoutEvent['type'] }
  | { readonly type: 'double-touch-not-allowed'; readonly weapon: Weapon }
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

/** Phases in which touches and cards can happen: regular fencing and sudden death. */
function isFencing(state: BoutState): boolean {
  return state.phase.kind === 'fencing' || state.phase.kind === 'extra-period';
}

function drawPriorityEvent(state: BoutState, side: Side, event: BoutEvent) {
  if (state.phase.kind !== 'priority-draw') return invalidPhase(state, event);
  return succeed({
    ...state,
    phase: { kind: 'extra-period' } as const,
    priority: side,
    clock: { remainingMs: state.rules.extraPeriodDurationMs, runningSince: null },
  });
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
    case 'touch-scored':
      return isFencing(state) ? succeed(scoreTouch(state, event.side, event.at)) : invalidPhase(state, event);
    case 'double-touch-scored':
      if (!isFencing(state)) return invalidPhase(state, event);
      if (!state.rules.doubleTouchAllowed) {
        return fail({ type: 'double-touch-not-allowed', weapon: state.rules.weapon });
      }
      return succeed(scoreDoubleTouch(state, event.at));
    case 'priority-drawn':
      return drawPriorityEvent(state, event.side, event);
    case 'card-given':
      return isFencing(state)
        ? succeed(giveCard(state, event.side, event.card, event.at))
        : invalidPhase(state, event);
  }
}
