import type { BoutState, Card } from './bout';
import { remainingAt, stopClock } from './clock';
import type { Side } from './rules';

export function opponentOf(side: Side): Side {
  return side === 'left' ? 'right' : 'left';
}

/**
 * Decides what a score change leads to. Reaching the limit while strictly ahead wins;
 * a tie at or above the limit (only reachable by double touches) keeps the bout going.
 * Otherwise the sabre mid-bout break starts the first time a fencer reaches its threshold.
 */
function afterScoreChange(state: BoutState, at: number): BoutState {
  const { left, right } = state.score;
  const { touchLimit, midBoutBreakAt, breakDurationMs } = state.rules;
  const best = Math.max(left, right);

  if (best >= touchLimit && left !== right) {
    const winner: Side = left > right ? 'left' : 'right';
    return { ...state, phase: { kind: 'finished', winner, reason: 'touch-limit' } };
  }

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
