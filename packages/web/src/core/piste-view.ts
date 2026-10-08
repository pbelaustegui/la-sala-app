import { remainingAt, settle, type FinishReason, type PhaseKind, type Side } from '@la-sala/domain';
import { countCards, type CardCounts } from './card-counts';
import type { BoardEntry } from './spectator-store';

export type { CardCounts };

/** Everything a board card or the detail screen shows for one piste. Pure data, no copy. */
export interface PisteView {
  readonly pisteId: string;
  /** `idle` while no bout was started on the piste. */
  readonly phase: PhaseKind | 'idle';
  readonly fencers: { readonly left: string; readonly right: string } | null;
  readonly score: Readonly<Record<Side, number>>;
  /** Time left on the fencing clock; null when no clock applies (break, priority draw, finished, idle). */
  readonly remainingMs: number | null;
  /** The fencing clock is ticking. Never true for stale data. */
  readonly running: boolean;
  /** Current period while fencing or in a period break; null otherwise. */
  readonly period: number | null;
  readonly periods: number;
  /** Countdown to the end of a break; null outside breaks. */
  readonly breakRemainingMs: number | null;
  readonly priority: Side | null;
  readonly winner: Side | null;
  readonly reason: FinishReason | null;
  readonly cards: Readonly<Record<Side, CardCounts>>;
  /** The connection dropped: this is the last known state, frozen at the moment it was received. */
  readonly stale: boolean;
}

/**
 * Derives the display fields from the latest snapshot of a piste.
 *
 * Estimated server time is `clientNow + entry.offsetMs`, then the DOMAIN settles the bout at
 * that instant (clock expiry, break end), so no rule or clock logic lives here. A stale
 * entry is evaluated at the server time of its snapshot, i.e. frozen, instead of letting a
 * dead connection keep a clock running.
 */
export function toPisteView(entry: BoardEntry, clientNow: number): PisteView {
  const { snapshot, stale, pisteId } = entry;
  const serverNow = stale ? snapshot.serverTime : clientNow + entry.offsetMs;

  if (!snapshot.bout) {
    return {
      pisteId, phase: 'idle', fencers: null, score: { left: 0, right: 0 }, remainingMs: null, running: false,
      period: null, periods: 0, breakRemainingMs: null, priority: null, winner: null, reason: null, cards: countCards([]), stale,
    };
  }

  const state = settle(snapshot.bout, serverNow);
  const { phase, rules } = state;

  const timed = phase.kind === 'fencing' || phase.kind === 'extra-period' || phase.kind === 'scheduled';
  let remainingMs: number | null = null;
  if (timed) remainingMs = phase.kind === 'scheduled' ? rules.periodDurationMs : remainingAt(state.clock, serverNow);

  return {
    pisteId,
    phase: phase.kind,
    fencers: snapshot.fencers,
    score: state.score,
    remainingMs,
    running: !stale && timed && state.clock.runningSince !== null,
    period: phase.kind === 'fencing' || phase.kind === 'break' ? phase.period : null,
    periods: rules.periods,
    breakRemainingMs: phase.kind === 'break' ? Math.max(0, phase.endsAt - serverNow) : null,
    priority: state.priority,
    winner: phase.kind === 'finished' ? phase.winner : null,
    reason: phase.kind === 'finished' ? phase.reason : null,
    cards: countCards(state.cards),
    stale,
  };
}
