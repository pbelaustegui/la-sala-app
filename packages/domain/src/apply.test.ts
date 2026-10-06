import { describe, expect, it } from 'vitest';
import { apply, type BoutEvent } from './apply';
import { createBout, type BoutState } from './bout';
import { createRules } from './rules';

function ok(state: BoutState, event: BoutEvent): BoutState {
  const result = apply(state, event);
  if (!result.ok) throw new Error(`expected ok, got ${JSON.stringify(result.error)}`);
  return result.state;
}

const fresh = () => createBout(createRules('foil'));

describe('apply: clock events', () => {
  it('starts the first period from scheduled', () => {
    const state = ok(fresh(), { type: 'clock-started', at: 1_000 });
    expect(state.phase).toEqual({ kind: 'fencing', period: 1 });
    expect(state.clock).toEqual({ remainingMs: 180_000, runningSince: 1_000 });
    expect(state.lastAt).toBe(1_000);
  });

  it('stopping preserves the remaining time and restarting continues from it', () => {
    let state = ok(fresh(), { type: 'clock-started', at: 0 });
    state = ok(state, { type: 'clock-stopped', at: 30_000 });
    expect(state.clock).toEqual({ remainingMs: 150_000, runningSince: null });
    state = ok(state, { type: 'clock-started', at: 100_000 });
    expect(state.clock).toEqual({ remainingMs: 150_000, runningSince: 100_000 });
  });

  it('rejects starting a running clock', () => {
    const state = ok(fresh(), { type: 'clock-started', at: 0 });
    expect(apply(state, { type: 'clock-started', at: 5 })).toEqual({
      ok: false,
      error: { type: 'clock-already-running' },
    });
  });

  it('rejects stopping a stopped clock', () => {
    const state = ok(fresh(), { type: 'clock-started', at: 0 });
    const stopped = ok(state, { type: 'clock-stopped', at: 10 });
    expect(apply(stopped, { type: 'clock-stopped', at: 20 })).toEqual({
      ok: false,
      error: { type: 'clock-not-running' },
    });
  });

  it('rejects events whose timestamp goes backwards', () => {
    const state = ok(fresh(), { type: 'clock-started', at: 1_000 });
    expect(apply(state, { type: 'clock-stopped', at: 999 })).toEqual({
      ok: false,
      error: { type: 'time-went-backwards', lastAt: 1_000, at: 999 },
    });
  });

  it('rejects clock-stopped on a scheduled bout', () => {
    expect(apply(fresh(), { type: 'clock-stopped', at: 0 })).toEqual({
      ok: false,
      error: { type: 'invalid-phase', phase: 'scheduled', event: 'clock-stopped' },
    });
  });

  it('settles before applying: a stop after expiry hits the break, not the clock', () => {
    const state = ok(fresh(), { type: 'clock-started', at: 0 });
    expect(apply(state, { type: 'clock-stopped', at: 200_000 })).toEqual({
      ok: false,
      error: { type: 'invalid-phase', phase: 'break', event: 'clock-stopped' },
    });
  });

  it('rejects starting the clock during a break', () => {
    const state = ok(fresh(), { type: 'clock-started', at: 0 });
    expect(apply(state, { type: 'clock-started', at: 190_000 })).toEqual({
      ok: false,
      error: { type: 'invalid-phase', phase: 'break', event: 'clock-started' },
    });
  });

  it('starts the next period once the break elapsed on its own', () => {
    const state = ok(fresh(), { type: 'clock-started', at: 0 });
    const next = ok(state, { type: 'clock-started', at: 300_000 });
    expect(next.phase).toEqual({ kind: 'fencing', period: 2 });
    expect(next.clock).toEqual({ remainingMs: 180_000, runningSince: 300_000 });
  });

  it('skips a break and lands in the next period with a stopped clock', () => {
    let state = ok(fresh(), { type: 'clock-started', at: 0 });
    state = ok(state, { type: 'break-skipped', at: 190_000 });
    expect(state.phase).toEqual({ kind: 'fencing', period: 2 });
    expect(state.clock).toEqual({ remainingMs: 180_000, runningSince: null });
  });

  it('rejects break-skipped outside a break', () => {
    const state = ok(fresh(), { type: 'clock-started', at: 0 });
    expect(apply(state, { type: 'break-skipped', at: 10 })).toEqual({
      ok: false,
      error: { type: 'invalid-phase', phase: 'fencing', event: 'break-skipped' },
    });
  });

  it('rejects any event on a finished bout', () => {
    const finished: BoutState = {
      ...fresh(),
      phase: { kind: 'finished', winner: 'left', reason: 'time' },
    };
    expect(apply(finished, { type: 'clock-started', at: 0 })).toEqual({
      ok: false,
      error: { type: 'bout-finished' },
    });
  });

  it('does not mutate the input state', () => {
    const state = fresh();
    const snapshot = JSON.parse(JSON.stringify(state));
    ok(state, { type: 'clock-started', at: 5 });
    expect(state).toEqual(snapshot);
  });
});
