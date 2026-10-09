import { remainingAt, type BoutEvent, type BoutState, type CardRecord, type FinishReason, type PhaseKind, type Side, type Weapon } from '@la-sala/domain';
import type { CopyKey } from '../i18n/t';

/** Copy key plus placeholders, so the view stays free of formatting and testable without a DOM. */
export interface Label {
  readonly key: CopyKey;
  readonly params: Readonly<Record<string, string | number>>;
}

export type DoubleTouchState = 'hidden' | 'disabled' | 'enabled';

/** What the manual correction form starts from and is bounded by. */
export interface CorrectionBasis {
  /** Regular period the bout is in (the last one when it is in the extra period or over). */
  readonly period: number;
  readonly periods: number;
  /** Time left on the stopped clock of the bout (0 in a break, a priority draw or after time). */
  readonly remainingMs: number;
  readonly periodDurationMs: number;
  readonly extraPeriodDurationMs: number;
  readonly inExtraPeriod: boolean;
}

/** Everything the scoreboard shows, derived from a settled `BoutState`. */
export interface ScoreboardView {
  readonly phase: PhaseKind;
  readonly phaseLabel: Label;
  readonly clockText: string;
  readonly clockRunning: boolean;
  /** What the main clock button does, or null when the clock cannot be controlled now. */
  readonly clockAction: 'start' | 'stop' | null;
  readonly score: Readonly<Record<Side, number>>;
  /** Touches and cards are accepted (regular fencing and sudden death). */
  readonly canScore: boolean;
  readonly doubleTouch: DoubleTouchState;
  readonly canSkipBreak: boolean;
  /** The judge must pick the side that won the coin toss. */
  readonly awaitingPriority: boolean;
  readonly priority: Side | null;
  readonly result: { readonly winner: Side; readonly reason: FinishReason } | null;
  readonly cards: readonly CardRecord[];
  readonly weapon: Weapon;
  /** A bout is under way: the screen should stay awake. */
  readonly active: boolean;
  readonly correction: CorrectionBasis;
}

/**
 * Remaining time as a scoreboard shows it. Rounds UP so the display never reads 0:00 while
 * time is left, and shows tenths in the last 10 seconds.
 */
export function formatClock(ms: number): string {
  if (ms <= 0) return '0:00';
  if (ms <= 9_900) return (Math.ceil(ms / 100) / 10).toFixed(1);
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function currentPeriod(state: BoutState): number {
  const { phase, rules } = state;
  switch (phase.kind) {
    case 'scheduled':
      return 1;
    case 'fencing':
    case 'break':
      return phase.period;
    case 'priority-draw':
    case 'extra-period':
    case 'finished':
      return rules.periods;
  }
}

function phaseLabel(state: BoutState): Label {
  const { phase, rules } = state;
  switch (phase.kind) {
    case 'scheduled':
      return { key: 'board.phase.scheduled', params: {} };
    case 'fencing':
      return { key: 'board.phase.period', params: { period: phase.period, periods: rules.periods } };
    case 'break':
      return { key: phase.breakKind === 'mid-bout' ? 'board.phase.breakMid' : 'board.phase.break', params: {} };
    case 'priority-draw':
      return { key: 'board.phase.priorityDraw', params: {} };
    case 'extra-period':
      return { key: 'board.phase.extra', params: {} };
    case 'finished':
      return { key: 'board.phase.finished', params: {} };
  }
}

/**
 * Derives the view from a state already settled at `now` (`LocalBout.state(now)`).
 * Pure: the same state and time always give the same view.
 */
export function scoreboardView(state: BoutState, now: number): ScoreboardView {
  const { phase, clock, rules } = state;
  const canScore = phase.kind === 'fencing' || phase.kind === 'extra-period';
  const timed = canScore || phase.kind === 'scheduled';
  const clockRunning = clock.runningSince !== null;

  let clockMs = remainingAt(clock, now);
  if (phase.kind === 'scheduled') clockMs = rules.periodDurationMs;
  if (phase.kind === 'break') clockMs = phase.endsAt - now;

  let doubleTouch: DoubleTouchState = 'hidden';
  if (rules.doubleTouchAllowed) doubleTouch = canScore ? 'enabled' : 'disabled';

  return {
    phase: phase.kind,
    phaseLabel: phaseLabel(state),
    clockText: formatClock(clockMs),
    clockRunning,
    clockAction: timed ? (clockRunning ? 'stop' : 'start') : null,
    score: state.score,
    canScore,
    doubleTouch,
    canSkipBreak: phase.kind === 'break',
    awaitingPriority: phase.kind === 'priority-draw',
    priority: state.priority,
    result: phase.kind === 'finished' ? { winner: phase.winner, reason: phase.reason } : null,
    cards: state.cards,
    weapon: rules.weapon,
    active: phase.kind !== 'scheduled' && phase.kind !== 'finished',
    correction: {
      period: currentPeriod(state),
      periods: rules.periods,
      remainingMs: phase.kind === 'scheduled' ? rules.periodDurationMs : remainingAt(clock, now),
      periodDurationMs: rules.periodDurationMs,
      extraPeriodDurationMs: rules.extraPeriodDurationMs,
      inExtraPeriod: phase.kind === 'extra-period',
    },
  };
}

/** Whether `undo` would revert something: applied events minus undos, as `replay` counts them. */
export function canUndo(events: readonly BoutEvent[]): boolean {
  let depth = 0;
  for (const event of events) depth += event.type === 'undo' ? -1 : 1;
  return depth > 0;
}
