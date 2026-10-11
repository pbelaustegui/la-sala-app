import type { Card, DomainError, Side, StateSetPatch } from '@la-sala/domain';
import { countCards } from '../core/card-counts';
import { EventFactory, type EventDraft } from '../core/event-factory';
import type { LocalBout } from '../core/local-bout';
import { Observable } from '../core/observable';
import { canUndo, scoreboardView, type ScoreboardView } from '../core/scoreboard-view';
import type { Timers } from '../core/sync-queue';

export interface ScoreboardModel extends ScoreboardView {
  readonly canUndo: boolean;
  /** False once a local write failed: the bout would be lost on reload. */
  readonly persisted: boolean;
  /** Domain error type of the last refused action, until the next success. */
  readonly error: DomainError['type'] | 'duplicate-event' | null;
  /** Limits carried by the last refused action (`maxMs`, `periods`), for specific messages. */
  readonly errorParams: Readonly<Record<string, number>>;
}

export interface ScoreboardDeps {
  readonly bout: LocalBout;
  /** Server-corrected "now" in epoch ms (`ClockOffset.correctedNow(Date.now())`). */
  readonly now: () => number;
  readonly newId: () => string;
  /** Called after every stored event so it is sent as soon as the network allows. */
  readonly sync: { kick(): void };
}

export const TICK_MS = 100;

const NO_ERROR = { error: null, errorParams: {} } as const;

/**
 * Turns judge actions into domain events on the local bout. The screen only calls these
 * methods and renders the model; rules stay in the domain and `LocalBout` validates every
 * event before storing it, so a refused action never reaches the log or the server.
 */
export class ScoreboardController extends Observable<ScoreboardModel> {
  private readonly factory: EventFactory;
  private error: Pick<ScoreboardModel, 'error' | 'errorParams'> = NO_ERROR;

  constructor(private readonly deps: ScoreboardDeps) {
    super(compute(deps, NO_ERROR));
    // Event time is the corrected clock but never earlier than the last stored event: a
    // better clock sample can move the estimate backwards and the domain rejects that.
    this.factory = new EventFactory({
      newId: deps.newId,
      now: () => Math.max(deps.now(), lastEventAt(deps.bout)),
    });
  }

  /** Recomputes the model for the current time (called by the UI tick). */
  refresh(): void {
    this.set(compute(this.deps, this.error));
  }

  touch(side: Side): void {
    this.perform({ type: 'touch-scored', side });
  }

  doubleTouch(): void {
    this.perform({ type: 'double-touch-scored' });
  }

  /** Starts the clock when stopped and stops it when running. */
  toggleClock(): void {
    const { clockAction } = this.get();
    if (clockAction === null) return;
    this.perform({ type: clockAction === 'start' ? 'clock-started' : 'clock-stopped' });
  }

  skipBreak(): void {
    this.perform({ type: 'break-skipped' });
  }

  drawPriority(side: Side): void {
    this.perform({ type: 'priority-drawn', side });
  }

  giveCard(side: Side, card: Card): void {
    this.perform({ type: 'card-given', side, card });
  }

  /** Removes one point from a side (never below zero). Only while fencing. */
  subtractPoint(side: Side): void {
    const { canScore, score } = this.get();
    if (!canScore) return;
    this.perform({ type: 'state-set', score: { ...score, [side]: Math.max(0, score[side] - 1) } });
  }

  /** Back to the start of the bout: 0-0, full clock, period 1, no cards. Priority is kept. */
  resetBout(): void {
    const { correction } = this.get();
    this.perform({
      type: 'state-set',
      score: { left: 0, right: 0 },
      remainingMs: correction.periodDurationMs,
      period: 1,
      clearCards: true,
    });
  }

  /** Sets the stopped clock to `minutes`, capped by the period length. */
  setClockPreset(minutes: number): void {
    const { clockAction, correction } = this.get();
    if (clockAction === null) return;
    const limit = correction.inExtraPeriod ? correction.extraPeriodDurationMs : correction.periodDurationMs;
    this.perform({ type: 'state-set', remainingMs: Math.min(minutes * 60_000, limit) });
  }

  /** Gives the card when the side has none of that type, otherwise removes one. Only while fencing. */
  toggleCard(side: Side, card: Card): void {
    const { canScore, cards } = this.get();
    if (!canScore) return;
    const present = countCards(cards)[side][card] > 0;
    this.perform({ type: present ? 'card-removed' : 'card-given', side, card });
  }

  /**
   * Manual correction of scores, clock and period. Works on a finished bout too (reopens it).
   * Returns whether the domain accepted it; on refusal `error` and `errorParams` say why.
   */
  setState(patch: StateSetPatch): boolean {
    return this.perform({ type: 'state-set', ...patch });
  }

  undo(): void {
    if (!canUndo(this.deps.bout.events().map((stored) => stored.event))) return;
    this.perform({ type: 'undo' });
  }

  /** Repaints every `ms` using the injected timers (UI only: events carry their own timestamps). */
  startTicking(timers: Timers, ms: number = TICK_MS): () => void {
    let handle: unknown = null;
    let stopped = false;
    const tick = () => {
      if (stopped) return;
      this.refresh();
      handle = timers.setTimeout(tick, ms);
    };
    handle = timers.setTimeout(tick, ms);
    return () => {
      stopped = true;
      if (handle !== null) timers.clearTimeout(handle);
    };
  }

  private perform(draft: EventDraft): boolean {
    const result = this.deps.bout.append(this.factory.create(draft));
    if (result.ok) {
      this.error = NO_ERROR;
      this.deps.sync.kick();
    } else {
      this.error = { error: result.error.type, errorParams: limits(result.error) };
    }
    this.refresh();
    return result.ok;
  }
}

function lastEventAt(bout: LocalBout): number {
  const events = bout.events();
  return events[events.length - 1]?.event.at ?? Number.NEGATIVE_INFINITY;
}

function limits(error: object): Record<string, number> {
  const found: Record<string, number> = {};
  if ('maxMs' in error && typeof error.maxMs === 'number') found.maxMs = error.maxMs;
  if ('periods' in error && typeof error.periods === 'number') found.periods = error.periods;
  return found;
}

function compute(deps: ScoreboardDeps, error: Pick<ScoreboardModel, 'error' | 'errorParams'>): ScoreboardModel {
  const now = deps.now();
  const events = deps.bout.events().map((stored) => stored.event);
  return {
    ...scoreboardView(deps.bout.state(now), now),
    canUndo: canUndo(events),
    persisted: deps.bout.persisted,
    ...error,
  };
}
