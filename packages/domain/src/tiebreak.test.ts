import { describe, expect, it } from 'vitest';
import { apply, type BoutEvent } from './apply';
import { createBout, type BoutState } from './bout';
import { settle } from './clock';
import { createRules, type Weapon } from './rules';

function ok(state: BoutState, event: BoutEvent): BoutState {
  const result = apply(state, event);
  if (!result.ok) throw new Error(`expected ok, got ${JSON.stringify(result.error)}`);
  return result.state;
}

function playAll(state: BoutState, events: readonly BoutEvent[]): BoutState {
  return events.reduce(ok, state);
}

/** Tied 1-1 after three full periods; the settled state is in the priority draw. */
function tiedAfterRegulation(weapon: Weapon = 'foil'): BoutState {
  const state = playAll(createBout(createRules(weapon)), [
    { type: 'clock-started', at: 0 },
    { type: 'touch-scored', side: 'left', at: 10_000 },
    { type: 'touch-scored', side: 'right', at: 20_000 },
    { type: 'clock-started', at: 30_000 }, // 170 s left in period 1 -> ends at 200 000
    { type: 'clock-started', at: 260_000 }, // after the break: period 2, ends at 440 000
    { type: 'clock-started', at: 500_000 }, // after the break: period 3, ends at 680 000
  ]);
  return settle(state, 680_000);
}

/** In sudden death with the clock stopped, priority to the given side. */
function suddenDeath(priority: 'left' | 'right', weapon: Weapon = 'foil'): BoutState {
  return ok(tiedAfterRegulation(weapon), { type: 'priority-drawn', side: priority, at: 700_000 });
}

describe('priority draw', () => {
  it('is reached when the last period ends tied', () => {
    const state = tiedAfterRegulation();
    expect(state.phase).toEqual({ kind: 'priority-draw' });
    expect(state.score).toEqual({ left: 1, right: 1 });
  });

  it('assigns priority and prepares a stopped 1-minute extra period', () => {
    const state = suddenDeath('right');
    expect(state.phase).toEqual({ kind: 'extra-period' });
    expect(state.priority).toBe('right');
    expect(state.clock).toEqual({ remainingMs: 60_000, runningSince: null });
  });

  it('rejects the draw outside the priority-draw phase', () => {
    const fencing = ok(createBout(createRules('foil')), { type: 'clock-started', at: 0 });
    expect(apply(fencing, { type: 'priority-drawn', side: 'left', at: 5 })).toEqual({
      ok: false,
      error: { type: 'invalid-phase', phase: 'fencing', event: 'priority-drawn' },
    });
  });

  it('rejects touches and clock events before priority is drawn', () => {
    const state = tiedAfterRegulation();
    expect(apply(state, { type: 'touch-scored', side: 'left', at: 680_000 })).toEqual({
      ok: false,
      error: { type: 'invalid-phase', phase: 'priority-draw', event: 'touch-scored' },
    });
    expect(apply(state, { type: 'clock-started', at: 680_000 })).toEqual({
      ok: false,
      error: { type: 'invalid-phase', phase: 'priority-draw', event: 'clock-started' },
    });
  });
});

describe('sudden-death extra period', () => {
  it('is won by the first touch, regardless of who holds priority', () => {
    let state = ok(suddenDeath('left'), { type: 'clock-started', at: 710_000 });
    state = ok(state, { type: 'touch-scored', side: 'right', at: 720_000 });
    expect(state.score).toEqual({ left: 1, right: 2 });
    expect(state.phase).toEqual({ kind: 'finished', winner: 'right', reason: 'time' });
  });

  it('awards the priority side when the minute runs out with no touch', () => {
    const state = ok(suddenDeath('right'), { type: 'clock-started', at: 710_000 });
    expect(settle(state, 769_999).phase).toEqual({ kind: 'extra-period' });
    expect(settle(state, 770_000).phase).toEqual({
      kind: 'finished',
      winner: 'right',
      reason: 'priority',
    });
  });

  it('keeps the minute across stops: only running time is consumed', () => {
    let state = ok(suddenDeath('left'), { type: 'clock-started', at: 710_000 });
    state = ok(state, { type: 'clock-stopped', at: 740_000 });
    expect(state.clock).toEqual({ remainingMs: 30_000, runningSince: null });
    state = ok(state, { type: 'clock-started', at: 900_000 });
    expect(settle(state, 929_999).phase).toEqual({ kind: 'extra-period' });
    expect(settle(state, 930_000).phase).toMatchObject({ kind: 'finished', winner: 'left' });
  });

  it('rejects a touch after the extra period expired', () => {
    const state = ok(suddenDeath('left'), { type: 'clock-started', at: 710_000 });
    expect(apply(state, { type: 'touch-scored', side: 'right', at: 771_000 })).toEqual({
      ok: false,
      error: { type: 'bout-finished' },
    });
  });

  it('OPEN simplification: a double touch in epee sudden death scores both and the extra period continues', () => {
    let state = ok(suddenDeath('left', 'epee'), { type: 'clock-started', at: 710_000 });
    state = ok(state, { type: 'double-touch-scored', at: 720_000 });
    expect(state.score).toEqual({ left: 2, right: 2 });
    expect(state.phase).toEqual({ kind: 'extra-period' });
    expect(state.clock).toEqual({ remainingMs: 50_000, runningSince: null });
  });

  it('a red card in sudden death gives the opponent the winning touch', () => {
    const state = ok(suddenDeath('left'), { type: 'card-given', side: 'left', card: 'red', at: 710_000 });
    expect(state.phase).toEqual({ kind: 'finished', winner: 'right', reason: 'time' });
  });

  it('a yellow card in sudden death is only recorded', () => {
    const state = ok(suddenDeath('left'), { type: 'card-given', side: 'right', card: 'yellow', at: 710_000 });
    expect(state.phase).toEqual({ kind: 'extra-period' });
    expect(state.cards).toEqual([{ side: 'right', card: 'yellow', at: 710_000 }]);
  });
});

describe('exclusion', () => {
  it('a black card in sudden death makes the opponent win by exclusion', () => {
    const state = ok(suddenDeath('left'), { type: 'card-given', side: 'left', card: 'black', at: 710_000 });
    expect(state.phase).toEqual({ kind: 'finished', winner: 'right', reason: 'exclusion' });
  });

  it('a black card wins even for the trailing opponent', () => {
    const state = playAll(createBout(createRules('foil')), [
      { type: 'clock-started', at: 0 },
      { type: 'touch-scored', side: 'right', at: 1_000 },
      { type: 'card-given', side: 'right', card: 'black', at: 2_000 },
    ]);
    expect(state.score).toEqual({ left: 0, right: 1 });
    expect(state.phase).toEqual({ kind: 'finished', winner: 'left', reason: 'exclusion' });
  });

  it('rejects cards during a break', () => {
    const state = ok(createBout(createRules('foil')), { type: 'clock-started', at: 0 });
    expect(apply(state, { type: 'card-given', side: 'left', card: 'black', at: 200_000 })).toEqual({
      ok: false,
      error: { type: 'invalid-phase', phase: 'break', event: 'card-given' },
    });
  });
});
