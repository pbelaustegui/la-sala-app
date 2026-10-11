import type { BoutState, Card, CardRecord } from './bout';
import { remainingAt, stopClock } from './clock';
import type { BoutEvent, DomainError } from './apply';
import type { Side } from './rules';

export function opponentOf(side: Side): Side {
  return side === 'left' ? 'right' : 'left';
}

/** Reaching the limit while strictly ahead wins; a tie at or above it keeps the bout going. */
export function finishedByTouchLimit(state: BoutState): BoutState | null {
  const { left, right } = state.score;
  if (Math.max(left, right) < state.rules.touchLimit || left === right) return null;
  const winner: Side = left > right ? 'left' : 'right';
  return { ...state, phase: { kind: 'finished', winner, reason: 'touch-limit' } };
}

/**
 * Decides what a score change leads to. Reaching the limit while strictly ahead wins
 * (see `finishedByTouchLimit`). Otherwise the sabre mid-bout break starts the first time
 * a fencer reaches its threshold.
 */
function afterScoreChange(state: BoutState, at: number): BoutState {
  const { left, right } = state.score;
  const { midBoutBreakAt, breakDurationMs } = state.rules;
  const best = Math.max(left, right);

  const finished = finishedByTouchLimit(state);
  if (finished) return finished;

  if (
    state.phase.kind === 'fencing' &&
    midBoutBreakAt !== null &&
    !state.midBoutBreakTaken &&
    best >= midBoutBreakAt
  ) {
    return {
      ...state,
      midBoutBreakTaken: true,
      phase: {
        kind: 'break',
        breakKind: 'mid-bout',
        period: state.phase.period,
        endsAt: at + breakDurationMs,
        resumeRemainingMs: remainingAt(state.clock, at),
      },
      clock: { remainingMs: 0, runningSince: null },
    };
  }
  return state;
}

function withStoppedClock(state: BoutState, at: number): BoutState {
  return { ...state, clock: stopClock(state.clock, at) };
}

/** A scored touch stops the clock. Caller guarantees the phase accepts scoring. */
export function scoreTouch(state: BoutState, side: Side, at: number): BoutState {
  const stopped = withStoppedClock(state, at);
  const score = { ...stopped.score, [side]: stopped.score[side] + 1 };
  if (stopped.phase.kind === 'extra-period') {
    // Sudden death: the first touch decides. Reason is 'time' (decided in overtime).
    return { ...stopped, score, phase: { kind: 'finished', winner: side, reason: 'time' } };
  }
  return afterScoreChange({ ...stopped, score }, at);
}

export function scoreDoubleTouch(state: BoutState, at: number): BoutState {
  const stopped = withStoppedClock(state, at);
  const score = { left: stopped.score.left + 1, right: stopped.score.right + 1 };
  return afterScoreChange({ ...stopped, score }, at);
}

/** Yellow: recorded only. Red: touch to the opponent. Black: exclusion, the opponent wins. */
export function giveCard(state: BoutState, side: Side, card: Card, at: number): BoutState {
  const recorded: BoutState = { ...state, cards: [...state.cards, { side, card, at }] };
  switch (card) {
    case 'yellow':
      return recorded;
    case 'red':
      return scoreTouch(recorded, opponentOf(side), at);
    case 'black':
      return {
        ...withStoppedClock(recorded, at),
        phase: { kind: 'finished', winner: opponentOf(side), reason: 'exclusion' },
      };
  }
}

type RemoveCardResult =
  | { readonly ok: true; readonly state: BoutState }
  | { readonly ok: false; readonly error: DomainError };

function withoutLatest(cards: readonly CardRecord[], side: Side, card: Card): readonly CardRecord[] | null {
  const index = cards.map((c) => c.side === side && c.card === card).lastIndexOf(true);
  return index === -1 ? null : cards.filter((_, i) => i !== index);
}

/**
 * Takes back the latest matching card and reverts what it caused: a red card's touch to the
 * opponent (never below 0) and a black card's exclusion. A bout finished by that touch or
 * exclusion is reopened to the last regular period with its clock stopped (the finished
 * phase does not remember its period, as with `state-set`); any other finished bout, or a
 * non-fencing phase, rejects the removal.
 */
export function removeCard(state: BoutState, side: Side, card: Card, event: BoutEvent): RemoveCardResult {
  const finished = state.phase.kind === 'finished' ? state.phase : null;
  if (!finished && state.phase.kind !== 'fencing' && state.phase.kind !== 'extra-period') {
    return { ok: false, error: { type: 'invalid-phase', phase: state.phase.kind, event: event.type } };
  }
  const cards = withoutLatest(state.cards, side, card);
  if (cards === null) return { ok: false, error: { type: 'card-not-found' } };

  const opponent = opponentOf(side);
  const score =
    card === 'red' ? { ...state.score, [opponent]: Math.max(0, state.score[opponent] - 1) } : state.score;
  const base: BoutState = { ...state, cards, score };
  if (!finished) return { ok: true, state: base };

  const causedFinish =
    (card === 'black' && finished.reason === 'exclusion' && finished.winner === opponent) ||
    (card === 'red' && finished.reason === 'touch-limit');
  if (!causedFinish) return { ok: false, error: { type: 'bout-finished' } };
  const reopened: BoutState = { ...base, phase: { kind: 'fencing', period: state.rules.periods } };
  return { ok: true, state: finishedByTouchLimit(reopened) ?? reopened };
}
