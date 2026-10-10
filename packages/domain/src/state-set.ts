import type { BoutState, Phase } from './bout';
import { onClockExpired, remainingAt } from './clock';
import type { Side } from './rules';
import { finishedByTouchLimit } from './scoring';

/** Fields a judge may correct. At least one is required; omitted fields keep their value. */
export interface StateSetPatch {
  readonly score?: Readonly<Record<Side, number>>;
  /** Time left on the (stopped) clock. */
  readonly remainingMs?: number;
  /** Regular period to fence in, 1..rules.periods. */
  readonly period?: number;
  /**
   * Removes the cards of both fencers. Only `true` is meaningful (there is no "keep"
   * value: omit the field). Nothing derived from a card is reverted: a touch a red card
   * awarded stays on the score, which the judge corrects with `score`.
   */
  readonly clearCards?: true;
}

export type StateSetError =
  | { readonly type: 'state-set-empty' }
  | { readonly type: 'state-set-invalid-score' }
  | { readonly type: 'state-set-invalid-remaining'; readonly maxMs: number }
  | { readonly type: 'state-set-invalid-period'; readonly periods: number }
  /** Reopening from an empty clock (finished, break, priority draw) without giving the time. */
  | { readonly type: 'state-set-needs-time' };

type StateSetResult =
  | { readonly ok: true; readonly state: BoutState }
  | { readonly ok: false; readonly error: StateSetError };

const isCount = (value: number): boolean => Number.isInteger(value) && value >= 0;

/** Period the bout is in, or the last regular one when it is not in a regular period. */
function currentPeriod(phase: Phase, periods: number): number {
  switch (phase.kind) {
    case 'scheduled':
      return 1;
    case 'fencing':
    case 'break':
      return phase.period;
    case 'priority-draw':
    case 'extra-period':
    case 'finished':
      return periods;
  }
}

/**
 * Applies a judge's correction to a state already settled at `at`. Validation is the
 * domain's job: the result is always fencing (or the extra period, if the bout is in it
 * and no period is given) with a stopped clock. Priority and the mid-bout break flag are
 * left alone, and so are cards unless `clearCards` is set (then both fencers' cards are
 * removed; a red card's touch and a black card's exclusion are not special cases: the
 * score is kept as is and the bout is reopened like with any other correction). The
 * corrected state then goes through the usual terminal checks: a touch limit reached
 * while ahead finishes the bout, and an empty clock expires through the normal clock logic (period break, priority draw or finish on time).
 */
export function applyStateSet(state: BoutState, patch: StateSetPatch & { readonly at: number }): StateSetResult {
  const { score, remainingMs, period, clearCards, at } = patch;
  const { rules } = state;
  const fail = (error: StateSetError): StateSetResult => ({ ok: false, error });

  if (score === undefined && remainingMs === undefined && period === undefined && clearCards === undefined) {
    return fail({ type: 'state-set-empty' });
  }
  if (score !== undefined && !(isCount(score.left) && isCount(score.right))) {
    return fail({ type: 'state-set-invalid-score' });
  }
  if (period !== undefined && !(Number.isInteger(period) && period >= 1 && period <= rules.periods)) {
    return fail({ type: 'state-set-invalid-period', periods: rules.periods });
  }

  const inExtraPeriod = state.phase.kind === 'extra-period' && period === undefined;
  const target: Phase = inExtraPeriod
    ? { kind: 'extra-period' }
    : { kind: 'fencing', period: period ?? currentPeriod(state.phase, rules.periods) };
  const maxMs = inExtraPeriod ? rules.extraPeriodDurationMs : rules.periodDurationMs;

  if (remainingMs !== undefined && !(isCount(remainingMs) && remainingMs <= maxMs)) {
    return fail({ type: 'state-set-invalid-remaining', maxMs });
  }

  const current = remainingAt(state.clock, at);
  if (remainingMs === undefined && current === 0 && state.phase.kind !== 'scheduled') {
    return fail({ type: 'state-set-needs-time' });
  }

  const corrected: BoutState = {
    ...state,
    phase: target,
    score: score ?? state.score,
    cards: clearCards ? [] : state.cards,
    clock: { remainingMs: remainingMs ?? Math.min(current, maxMs), runningSince: null },
  };
  const finished = finishedByTouchLimit(corrected);
  if (finished) return { ok: true, state: finished };
  return { ok: true, state: corrected.clock.remainingMs === 0 ? onClockExpired(corrected, at) : corrected };
}
