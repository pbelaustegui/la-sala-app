import { describe, expect, it } from 'vitest';
import { apply, type BoutEvent } from './apply';
import { createBout, type BoutState } from './bout';
import { replay } from './replay';
import { createRules, type RulesOptions, type Weapon } from './rules';

const bout = (weapon: Weapon = 'foil', options?: RulesOptions) => createBout(createRules(weapon, options));

function ok(state: BoutState, event: BoutEvent): BoutState {
  const result = apply(state, event);
  if (!result.ok) throw new Error(`expected ok, got ${JSON.stringify(result.error)}`);
  return result.state;
}

function replayOk(initial: BoutState, events: readonly BoutEvent[]): BoutState {
  const result = replay(initial, events);
  if (!result.ok) throw new Error(`expected ok, got ${JSON.stringify(result.error)}`);
  return result.state;
}

/** Fifteen left touches: finished by touch limit, clock stopped with time left. */
const leftWinsEvents: BoutEvent[] = [
  { type: 'clock-started', at: 0 },
  ...Array.from({ length: 15 }, (_, i): BoutEvent => ({ type: 'touch-scored', side: 'left', at: 1_000 * (i + 1) })),
];

describe('state-set: corrections', () => {
  it('resets the clock to the period duration and stops it', () => {
    let state = ok(bout(), { type: 'clock-started', at: 0 });
    state = ok(state, { type: 'touch-scored', side: 'left', at: 30_000 });
    const next = ok(state, { type: 'state-set', remainingMs: 180_000, at: 40_000 });
    expect(next.clock).toEqual({ remainingMs: 180_000, runningSince: null });
    expect(next.phase).toEqual({ kind: 'fencing', period: 1 });
    expect(next.score).toEqual({ left: 1, right: 0 });
    expect(next.lastAt).toBe(40_000);
  });

  it('stops a running clock: the patch replaces the time settled at the event', () => {
    const state = ok(bout(), { type: 'clock-started', at: 0 });
    const next = ok(state, { type: 'state-set', remainingMs: 90_000, at: 10_000 });
    expect(next.clock).toEqual({ remainingMs: 90_000, runningSince: null });
  });

  it('keeps the remaining time when it is not part of the patch', () => {
    let state = ok(bout(), { type: 'clock-started', at: 0 });
    state = ok(state, { type: 'clock-stopped', at: 30_000 });
    const next = ok(state, { type: 'state-set', score: { left: 3, right: 2 }, at: 31_000 });
    expect(next.clock).toEqual({ remainingMs: 150_000, runningSince: null });
  });

  it('resets the scores to 0-0', () => {
    let state = ok(bout(), { type: 'clock-started', at: 0 });
    state = ok(state, { type: 'touch-scored', side: 'left', at: 1_000 });
    state = ok(state, { type: 'touch-scored', side: 'right', at: 2_000 });
    const next = ok(state, { type: 'state-set', score: { left: 0, right: 0 }, at: 3_000 });
    expect(next.score).toEqual({ left: 0, right: 0 });
    expect(next.phase).toEqual({ kind: 'fencing', period: 1 });
  });

  it('sets arbitrary score, time and period at once', () => {
    const state = ok(bout(), { type: 'clock-started', at: 0 });
    const next = ok(state, {
      type: 'state-set',
      score: { left: 7, right: 5 },
      remainingMs: 90_000,
      period: 2,
      at: 5_000,
    });
    expect(next.score).toEqual({ left: 7, right: 5 });
    expect(next.clock).toEqual({ remainingMs: 90_000, runningSince: null });
    expect(next.phase).toEqual({ kind: 'fencing', period: 2 });
  });

  it('leaves cards, priority and the mid-bout break flag untouched', () => {
    let state = ok(bout('sabre'), { type: 'clock-started', at: 0 });
    state = ok(state, { type: 'card-given', side: 'left', card: 'yellow', at: 1_000 });
    const next = ok(state, { type: 'state-set', score: { left: 1, right: 1 }, at: 2_000 });
    expect(next.cards).toEqual(state.cards);
    expect(next.priority).toBe(state.priority);
    expect(next.midBoutBreakTaken).toBe(state.midBoutBreakTaken);
  });

  it('starts a scheduled bout in the target period with a stopped clock', () => {
    const next = ok(bout(), { type: 'state-set', score: { left: 2, right: 1 }, at: 0 });
    expect(next.phase).toEqual({ kind: 'fencing', period: 1 });
    expect(next.clock).toEqual({ remainingMs: 180_000, runningSince: null });
    expect(next.score).toEqual({ left: 2, right: 1 });
  });

  it('leaves a break for fencing in the period that just ended', () => {
    const state = ok(bout(), { type: 'clock-started', at: 0 });
    const next = ok(state, { type: 'state-set', remainingMs: 100_000, at: 190_000 });
    expect(next.phase).toEqual({ kind: 'fencing', period: 1 });
    expect(next.clock).toEqual({ remainingMs: 100_000, runningSince: null });
  });

  it('rejects a break correction that gives no time, as the clock is empty', () => {
    const state = ok(bout(), { type: 'clock-started', at: 0 });
    expect(apply(state, { type: 'state-set', score: { left: 1, right: 0 }, at: 190_000 })).toEqual({
      ok: false,
      error: { type: 'state-set-needs-time' },
    });
  });

  it('stays in the extra period when no period is given', () => {
    let state = ok(bout(), { type: 'clock-started', at: 0 });
    state = ok(state, { type: 'state-set', score: { left: 4, right: 4 }, period: 3, remainingMs: 1_000, at: 100 });
    state = ok(state, { type: 'clock-started', at: 200 });
    state = ok(state, { type: 'priority-drawn', side: 'right', at: 5_000 });
    expect(state.phase).toEqual({ kind: 'extra-period' });
    const next = ok(state, { type: 'state-set', score: { left: 5, right: 5 }, at: 6_000 });
    expect(next.phase).toEqual({ kind: 'extra-period' });
    expect(next.priority).toBe('right');
    expect(next.score).toEqual({ left: 5, right: 5 });
  });

  it('moves from the extra period to a regular period when one is given', () => {
    let state = ok(bout(), { type: 'state-set', score: { left: 4, right: 4 }, period: 3, remainingMs: 1_000, at: 0 });
    state = ok(state, { type: 'clock-started', at: 100 });
    state = ok(state, { type: 'priority-drawn', side: 'left', at: 5_000 });
    const next = ok(state, { type: 'state-set', period: 2, remainingMs: 60_000, at: 6_000 });
    expect(next.phase).toEqual({ kind: 'fencing', period: 2 });
  });
});

describe('state-set: reopening a finished bout', () => {
  it('reopens by score, in the last regular period, keeping the stopped time', () => {
    const finished = replayOk(bout(), leftWinsEvents);
    expect(finished.phase).toEqual({ kind: 'finished', winner: 'left', reason: 'touch-limit' });
    const next = ok(finished, { type: 'state-set', score: { left: 14, right: 3 }, at: 20_000 });
    expect(next.phase).toEqual({ kind: 'fencing', period: 3 });
    expect(next.score).toEqual({ left: 14, right: 3 });
    expect(next.clock).toEqual({ remainingMs: finished.clock.remainingMs, runningSince: null });
  });

  it('reopens by time: expired bout gets a new clock', () => {
    let state = bout('foil', { periods: 1 });
    state = ok(state, { type: 'clock-started', at: 0 });
    state = ok(state, { type: 'touch-scored', side: 'left', at: 1_000 });
    state = ok(state, { type: 'clock-started', at: 2_000 });
    const next = ok(state, { type: 'state-set', remainingMs: 30_000, at: 300_000 });
    expect(next.phase).toEqual({ kind: 'fencing', period: 1 });
    expect(next.clock).toEqual({ remainingMs: 30_000, runningSince: null });
    expect(next.score).toEqual({ left: 1, right: 0 });
  });

  it('rejects reopening an expired bout without time', () => {
    let state = bout('foil', { periods: 1 });
    state = ok(state, { type: 'clock-started', at: 0 });
    state = ok(state, { type: 'touch-scored', side: 'left', at: 1_000 });
    state = ok(state, { type: 'clock-started', at: 2_000 });
    expect(apply(state, { type: 'state-set', score: { left: 0, right: 0 }, at: 300_000 })).toEqual({
      ok: false,
      error: { type: 'state-set-needs-time' },
    });
  });

  it('still rejects every other event once finished', () => {
    const finished = replayOk(bout(), leftWinsEvents);
    const others: BoutEvent[] = [
      { type: 'clock-started', at: 20_000 },
      { type: 'clock-stopped', at: 20_000 },
      { type: 'break-skipped', at: 20_000 },
      { type: 'touch-scored', side: 'right', at: 20_000 },
      { type: 'priority-drawn', side: 'left', at: 20_000 },
      { type: 'card-given', side: 'left', card: 'yellow', at: 20_000 },
    ];
    for (const event of others) {
      expect(apply(finished, event)).toEqual({ ok: false, error: { type: 'bout-finished' } });
    }
  });
});

describe('state-set: terminal checks', () => {
  it('finishes again when the patched score reaches the limit while ahead', () => {
    const state = ok(bout(), { type: 'clock-started', at: 0 });
    const next = ok(state, { type: 'state-set', score: { left: 15, right: 12 }, at: 1_000 });
    expect(next.phase).toEqual({ kind: 'finished', winner: 'left', reason: 'touch-limit' });
  });

  it('does not finish a tie at the limit', () => {
    const state = ok(bout(), { type: 'clock-started', at: 0 });
    const next = ok(state, { type: 'state-set', score: { left: 15, right: 15 }, at: 1_000 });
    expect(next.phase).toEqual({ kind: 'fencing', period: 1 });
  });

  it('expires the clock through the normal logic: end of a period goes to the break', () => {
    const state = ok(bout(), { type: 'clock-started', at: 0 });
    const next = ok(state, { type: 'state-set', remainingMs: 0, at: 1_000 });
    expect(next.phase).toEqual({
      kind: 'break',
      breakKind: 'period',
      period: 1,
      endsAt: 1_000 + 60_000,
      resumeRemainingMs: null,
    });
  });

  it('expires the last period: the leader wins on time', () => {
    const state = ok(bout(), { type: 'clock-started', at: 0 });
    const next = ok(state, {
      type: 'state-set',
      score: { left: 5, right: 3 },
      period: 3,
      remainingMs: 0,
      at: 1_000,
    });
    expect(next.phase).toEqual({ kind: 'finished', winner: 'left', reason: 'time' });
  });

  it('expires the last period on a tie: priority draw', () => {
    const state = ok(bout(), { type: 'clock-started', at: 0 });
    const next = ok(state, {
      type: 'state-set',
      score: { left: 4, right: 4 },
      period: 3,
      remainingMs: 0,
      at: 1_000,
    });
    expect(next.phase).toEqual({ kind: 'priority-draw' });
  });
});

describe('state-set: replay and undo', () => {
  it('undo reverts a correction', () => {
    const events: BoutEvent[] = [
      { type: 'clock-started', at: 0 },
      { type: 'touch-scored', side: 'left', at: 10_000 },
      { type: 'state-set', score: { left: 0, right: 0 }, remainingMs: 180_000, at: 20_000 },
    ];
    const corrected = replayOk(bout(), events);
    expect(corrected.score).toEqual({ left: 0, right: 0 });
    const undone = replayOk(bout(), [...events, { type: 'undo', at: 21_000 }]);
    expect(undone).toEqual(replayOk(bout(), events.slice(0, 2)));
  });

  it('undo of a reopening restores the finished bout', () => {
    const reopen: BoutEvent = { type: 'state-set', score: { left: 14, right: 3 }, at: 20_000 };
    const reopened = replayOk(bout(), [...leftWinsEvents, reopen]);
    expect(reopened.phase.kind).toBe('fencing');
    const undone = replayOk(bout(), [...leftWinsEvents, reopen, { type: 'undo', at: 21_000 }]);
    expect(undone).toEqual(replayOk(bout(), leftWinsEvents));
    expect(undone.phase).toEqual({ kind: 'finished', winner: 'left', reason: 'touch-limit' });
  });

  it('accepts events after a reopening', () => {
    const state = replayOk(bout(), [
      ...leftWinsEvents,
      { type: 'state-set', score: { left: 14, right: 3 }, at: 20_000 },
      { type: 'touch-scored', side: 'left', at: 21_000 },
    ]);
    expect(state.phase).toEqual({ kind: 'finished', winner: 'left', reason: 'touch-limit' });
    expect(state.score).toEqual({ left: 15, right: 3 });
  });

  it('is deterministic', () => {
    const events: BoutEvent[] = [
      { type: 'clock-started', at: 0 },
      { type: 'state-set', score: { left: 2, right: 2 }, remainingMs: 60_000, period: 2, at: 5_000 },
    ];
    expect(replayOk(bout(), events)).toEqual(replayOk(bout(), events));
  });
});

describe('state-set: validation', () => {
  const started = () => ok(bout(), { type: 'clock-started', at: 1_000 });
  const rejects = (event: BoutEvent, error: object) =>
    expect(apply(started(), event)).toEqual({ ok: false, error });

  it('rejects time going backwards', () => {
    rejects(
      { type: 'state-set', remainingMs: 1_000, at: 999 },
      { type: 'time-went-backwards', lastAt: 1_000, at: 999 },
    );
  });

  it('rejects time going backwards on a finished bout too', () => {
    const finished = replayOk(bout(), leftWinsEvents);
    expect(apply(finished, { type: 'state-set', remainingMs: 1_000, at: 14_999 })).toEqual({
      ok: false,
      error: { type: 'time-went-backwards', lastAt: 15_000, at: 14_999 },
    });
  });

  it('rejects an empty patch', () => {
    rejects({ type: 'state-set', at: 2_000 }, { type: 'state-set-empty' });
  });

  it.each([
    { left: -1, right: 0 },
    { left: 0, right: -3 },
    { left: 1.5, right: 0 },
    { left: 0, right: Number.NaN },
    { left: Number.POSITIVE_INFINITY, right: 0 },
  ])('rejects the invalid score %j', (score) => {
    rejects({ type: 'state-set', score, at: 2_000 }, { type: 'state-set-invalid-score' });
  });

  it.each([-1, 0.5, Number.NaN, 180_001])('rejects the invalid remaining time %s', (remainingMs) => {
    rejects(
      { type: 'state-set', remainingMs, at: 2_000 },
      { type: 'state-set-invalid-remaining', maxMs: 180_000 },
    );
  });

  it('bounds the remaining time by the target period, not the current one', () => {
    rejects(
      { type: 'state-set', period: 2, remainingMs: 180_001, at: 2_000 },
      { type: 'state-set-invalid-remaining', maxMs: 180_000 },
    );
  });

  it('bounds the remaining time of the extra period by its own duration', () => {
    let state = ok(bout(), { type: 'state-set', score: { left: 4, right: 4 }, period: 3, remainingMs: 1_000, at: 0 });
    state = ok(state, { type: 'clock-started', at: 100 });
    state = ok(state, { type: 'priority-drawn', side: 'left', at: 5_000 });
    expect(apply(state, { type: 'state-set', remainingMs: 60_001, at: 6_000 })).toEqual({
      ok: false,
      error: { type: 'state-set-invalid-remaining', maxMs: 60_000 },
    });
    expect(ok(state, { type: 'state-set', remainingMs: 60_000, at: 6_000 }).clock.remainingMs).toBe(60_000);
  });

  it.each([0, 4, 1.5, -1, Number.NaN])('rejects the invalid period %s', (period) => {
    rejects({ type: 'state-set', period, at: 2_000 }, { type: 'state-set-invalid-period', periods: 3 });
  });

  it('rejects a period beyond the periods of the rules', () => {
    const state = ok(bout('foil', { periods: 2 }), { type: 'clock-started', at: 0 });
    expect(apply(state, { type: 'state-set', period: 3, at: 1 })).toEqual({
      ok: false,
      error: { type: 'state-set-invalid-period', periods: 2 },
    });
  });

  it('does not mutate the input state', () => {
    const state = started();
    const snapshot = JSON.parse(JSON.stringify(state));
    ok(state, { type: 'state-set', score: { left: 3, right: 3 }, at: 2_000 });
    expect(state).toEqual(snapshot);
  });
});
