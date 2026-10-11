import { describe, expect, it } from 'vitest';
import { apply, type BoutEvent } from './apply';
import { createBout, type BoutState } from './bout';
import { createRules, type RulesOptions, type Weapon } from './rules';

function ok(state: BoutState, event: BoutEvent): BoutState {
  const result = apply(state, event);
  if (!result.ok) throw new Error(`expected ok, got ${JSON.stringify(result.error)}`);
  return result.state;
}

/** A bout in period 1 with the clock running since t=0. */
function running(weapon: Weapon = 'foil', options: RulesOptions = {}): BoutState {
  return ok(createBout(createRules(weapon, options)), { type: 'clock-started', at: 0 });
}

function withScore(state: BoutState, left: number, right: number): BoutState {
  return { ...state, score: { left, right } };
}

describe('touches', () => {
  it('scores for the side and stops the clock', () => {
    const state = ok(running(), { type: 'touch-scored', side: 'left', at: 20_000 });
    expect(state.score).toEqual({ left: 1, right: 0 });
    expect(state.clock).toEqual({ remainingMs: 160_000, runningSince: null });
    expect(state.phase).toEqual({ kind: 'fencing', period: 1 });
  });

  it('accepts a touch while the clock is stopped, leaving the clock untouched', () => {
    let state = ok(running(), { type: 'clock-stopped', at: 10_000 });
    state = ok(state, { type: 'touch-scored', side: 'right', at: 12_000 });
    expect(state.score).toEqual({ left: 0, right: 1 });
    expect(state.clock).toEqual({ remainingMs: 170_000, runningSince: null });
  });

  it('rejects a touch before the bout started', () => {
    expect(apply(createBout(createRules('foil')), { type: 'touch-scored', side: 'left', at: 0 })).toEqual({
      ok: false,
      error: { type: 'invalid-phase', phase: 'scheduled', event: 'touch-scored' },
    });
  });

  it('rejects a touch during a break', () => {
    expect(apply(running(), { type: 'touch-scored', side: 'left', at: 200_000 })).toEqual({
      ok: false,
      error: { type: 'invalid-phase', phase: 'break', event: 'touch-scored' },
    });
  });

  it('rejects a touch after the clock expired in the last period', () => {
    const last: BoutState = { ...running(), phase: { kind: 'fencing', period: 3 } };
    expect(apply(withScore(last, 3, 1), { type: 'touch-scored', side: 'right', at: 180_001 })).toEqual({
      ok: false,
      error: { type: 'bout-finished' },
    });
  });

  it('wins by reaching the touch limit', () => {
    const state = ok(withScore(running(), 14, 9), { type: 'touch-scored', side: 'left', at: 5_000 });
    expect(state.score).toEqual({ left: 15, right: 9 });
    expect(state.phase).toEqual({ kind: 'finished', winner: 'left', reason: 'touch-limit' });
  });

  it('honors a pool-style limit of 5 touches', () => {
    const pool = running('epee', { periods: 1, touchLimit: 5 });
    const state = ok(withScore(pool, 2, 4), { type: 'touch-scored', side: 'right', at: 1_000 });
    expect(state.phase).toEqual({ kind: 'finished', winner: 'right', reason: 'touch-limit' });
  });

  it('rejects events once the bout is finished by the touch limit', () => {
    const done = ok(withScore(running(), 14, 0), { type: 'touch-scored', side: 'left', at: 1 });
    expect(apply(done, { type: 'touch-scored', side: 'right', at: 2 })).toEqual({
      ok: false,
      error: { type: 'bout-finished' },
    });
  });
});

describe('double touches', () => {
  it('scores for both sides in epee and stops the clock', () => {
    const state = ok(running('epee'), { type: 'double-touch-scored', at: 30_000 });
    expect(state.score).toEqual({ left: 1, right: 1 });
    expect(state.clock).toEqual({ remainingMs: 150_000, runningSince: null });
  });

  it.each(['foil', 'sabre'] as const)('is rejected in %s', (weapon) => {
    expect(apply(running(weapon), { type: 'double-touch-scored', at: 10 })).toEqual({
      ok: false,
      error: { type: 'double-touch-not-allowed', weapon },
    });
  });

  it('lets the leader win when a double touch lifts only them to the limit', () => {
    const state = ok(withScore(running('epee'), 14, 13), { type: 'double-touch-scored', at: 10 });
    expect(state.score).toEqual({ left: 15, right: 14 });
    expect(state.phase).toEqual({ kind: 'finished', winner: 'left', reason: 'touch-limit' });
  });

  it('OPEN simplification: a double touch taking both sides to the limit keeps the bout going', () => {
    const state = ok(withScore(running('epee'), 14, 14), { type: 'double-touch-scored', at: 10 });
    expect(state.score).toEqual({ left: 15, right: 15 });
    expect(state.phase).toEqual({ kind: 'fencing', period: 1 });
  });

  it('OPEN simplification: after a limit tie, the next touch decides', () => {
    let state = ok(withScore(running('epee'), 14, 14), { type: 'double-touch-scored', at: 10 });
    state = ok(state, { type: 'touch-scored', side: 'right', at: 20 });
    expect(state.score).toEqual({ left: 15, right: 16 });
    expect(state.phase).toEqual({ kind: 'finished', winner: 'right', reason: 'touch-limit' });
  });
});

describe('sabre mid-bout break', () => {
  it('starts when a fencer first reaches 8 and preserves the remaining time', () => {
    const state = ok(withScore(running('sabre'), 7, 3), { type: 'touch-scored', side: 'left', at: 50_000 });
    expect(state.phase).toEqual({
      kind: 'break',
      breakKind: 'mid-bout',
      period: 1,
      endsAt: 110_000,
      resumeRemainingMs: 130_000,
    });
    expect(state.score).toEqual({ left: 8, right: 3 });
  });

  it('resumes the same period with a stopped clock holding the preserved time', () => {
    let state = ok(withScore(running('sabre'), 7, 3), { type: 'touch-scored', side: 'left', at: 50_000 });
    state = ok(state, { type: 'clock-started', at: 110_000 });
    expect(state.phase).toEqual({ kind: 'fencing', period: 1 });
    expect(state.clock).toEqual({ remainingMs: 130_000, runningSince: 110_000 });
  });

  it('can be skipped, resuming with the preserved time', () => {
    let state = ok(withScore(running('sabre'), 7, 3), { type: 'touch-scored', side: 'left', at: 50_000 });
    state = ok(state, { type: 'break-skipped', at: 60_000 });
    expect(state.phase).toEqual({ kind: 'fencing', period: 1 });
    expect(state.clock).toEqual({ remainingMs: 130_000, runningSince: null });
  });

  it('happens only once per bout', () => {
    let state = ok(withScore(running('sabre'), 7, 7), { type: 'touch-scored', side: 'left', at: 10_000 });
    state = ok(state, { type: 'break-skipped', at: 11_000 });
    state = ok(state, { type: 'touch-scored', side: 'right', at: 12_000 });
    expect(state.score).toEqual({ left: 8, right: 8 });
    expect(state.phase).toEqual({ kind: 'fencing', period: 1 });
  });

  it('does not happen when the touch limit is not 15', () => {
    const state = ok(withScore(running('sabre', { touchLimit: 10 }), 7, 0), {
      type: 'touch-scored',
      side: 'left',
      at: 1_000,
    });
    expect(state.phase).toEqual({ kind: 'fencing', period: 1 });
  });

  it('does not happen in foil', () => {
    const state = ok(withScore(running('foil'), 7, 0), { type: 'touch-scored', side: 'left', at: 1_000 });
    expect(state.phase).toEqual({ kind: 'fencing', period: 1 });
  });

  it('rejects touches while the break is running', () => {
    const state = ok(withScore(running('sabre'), 7, 3), { type: 'touch-scored', side: 'left', at: 50_000 });
    expect(apply(state, { type: 'touch-scored', side: 'right', at: 60_000 })).toEqual({
      ok: false,
      error: { type: 'invalid-phase', phase: 'break', event: 'touch-scored' },
    });
  });
});

describe('cards', () => {
  it('records a yellow card without changing score or clock', () => {
    const state = ok(running(), { type: 'card-given', side: 'left', card: 'yellow', at: 10_000 });
    expect(state.cards).toEqual([{ side: 'left', card: 'yellow', at: 10_000 }]);
    expect(state.score).toEqual({ left: 0, right: 0 });
    expect(state.clock).toEqual({ remainingMs: 180_000, runningSince: 0 });
  });

  it('gives the opponent a touch for a red card and stops the clock', () => {
    const state = ok(running(), { type: 'card-given', side: 'left', card: 'red', at: 10_000 });
    expect(state.score).toEqual({ left: 0, right: 1 });
    expect(state.clock).toEqual({ remainingMs: 170_000, runningSince: null });
    expect(state.cards).toEqual([{ side: 'left', card: 'red', at: 10_000 }]);
  });

  it('lets a red card decide the bout at the touch limit', () => {
    const state = ok(withScore(running(), 3, 14), { type: 'card-given', side: 'left', card: 'red', at: 10 });
    expect(state.phase).toEqual({ kind: 'finished', winner: 'right', reason: 'touch-limit' });
  });

  it('excludes the carded fencer on a black card: the opponent wins', () => {
    const state = ok(withScore(running(), 9, 2), { type: 'card-given', side: 'left', card: 'black', at: 10 });
    expect(state.phase).toEqual({ kind: 'finished', winner: 'right', reason: 'exclusion' });
    expect(state.cards).toEqual([{ side: 'left', card: 'black', at: 10 }]);
  });

  it('rejects cards outside fencing', () => {
    expect(apply(createBout(createRules('foil')), { type: 'card-given', side: 'left', card: 'yellow', at: 0 })).toEqual({
      ok: false,
      error: { type: 'invalid-phase', phase: 'scheduled', event: 'card-given' },
    });
  });
});

describe('card removal', () => {
  const give = (state: BoutState, side: 'left' | 'right', card: 'yellow' | 'red' | 'black', at: number) =>
    ok(state, { type: 'card-given', side, card, at });
  const remove = (state: BoutState, side: 'left' | 'right', card: 'yellow' | 'red' | 'black', at: number) =>
    apply(state, { type: 'card-removed', side, card, at });

  it('removes a yellow card and nothing else', () => {
    const given = give(running(), 'left', 'yellow', 1_000);
    const res = remove(given, 'left', 'yellow', 2_000);
    expect(res).toMatchObject({ ok: true, state: { cards: [], score: { left: 0, right: 0 } } });
  });

  it('removes only the latest matching record', () => {
    let state = give(running(), 'left', 'yellow', 1_000);
    state = give(state, 'left', 'yellow', 2_000);
    const res = remove(state, 'left', 'yellow', 3_000);
    expect(res.ok && res.state.cards).toEqual([{ side: 'left', card: 'yellow', at: 1_000 }]);
  });

  it('removing a red card takes back the opponent touch', () => {
    const given = give(running(), 'left', 'red', 1_000);
    expect(given.score).toEqual({ left: 0, right: 1 });
    const res = remove(given, 'left', 'red', 2_000);
    expect(res).toMatchObject({ ok: true, state: { cards: [], score: { left: 0, right: 0 } } });
  });

  it('never takes the score below zero', () => {
    const given = withScore(give(running(), 'left', 'red', 1_000), 0, 0);
    const res = remove(given, 'left', 'red', 2_000);
    expect(res.ok && res.state.score).toEqual({ left: 0, right: 0 });
  });

  it('reopens a bout the red-granted touch finished', () => {
    const given = give(withScore(running(), 0, 14), 'left', 'red', 1_000);
    expect(given.phase).toMatchObject({ kind: 'finished', reason: 'touch-limit' });
    const res = remove(given, 'left', 'red', 2_000);
    expect(res).toMatchObject({
      ok: true,
      state: { phase: { kind: 'fencing' }, score: { left: 0, right: 14 }, clock: { runningSince: null } },
    });
  });

  it('removing a black card undoes the exclusion and keeps the clock stopped', () => {
    const given = give(running(), 'right', 'black', 5_000);
    expect(given.phase).toMatchObject({ kind: 'finished', reason: 'exclusion' });
    const res = remove(given, 'right', 'black', 6_000);
    expect(res).toMatchObject({
      ok: true,
      state: { phase: { kind: 'fencing' }, cards: [], clock: { remainingMs: 175_000, runningSince: null } },
    });
  });

  it('fails when there is no matching card', () => {
    const given = give(running(), 'left', 'yellow', 1_000);
    expect(remove(given, 'right', 'yellow', 2_000)).toEqual({ ok: false, error: { type: 'card-not-found' } });
    expect(remove(given, 'left', 'red', 2_000)).toEqual({ ok: false, error: { type: 'card-not-found' } });
  });

  it('is rejected outside fencing', () => {
    expect(remove(createBout(createRules('foil')), 'left', 'yellow', 0)).toEqual({
      ok: false,
      error: { type: 'invalid-phase', phase: 'scheduled', event: 'card-removed' },
    });
  });

  it('is rejected on a bout finished by something other than the card', () => {
    let done = give(running(), 'left', 'yellow', 1_000);
    done = ok(withScore(done, 14, 0), { type: 'touch-scored', side: 'left', at: 2_000 });
    expect(remove(done, 'left', 'yellow', 3_000)).toEqual({ ok: false, error: { type: 'bout-finished' } });
  });
});
