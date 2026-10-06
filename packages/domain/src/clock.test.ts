import { describe, expect, it } from 'vitest';
import { createBout, type BoutState } from './bout';
import { remainingAt, settle } from './clock';
import { createRules, type RulesOptions, type Weapon } from './rules';

function fencing(
  overrides: Partial<BoutState> = {},
  weapon: Weapon = 'foil',
  options: RulesOptions = {},
): BoutState {
  return {
    ...createBout(createRules(weapon, options)),
    phase: { kind: 'fencing', period: 1 },
    clock: { remainingMs: 180_000, runningSince: 0 },
    ...overrides,
  };
}

describe('remainingAt', () => {
  it('returns the stored remaining time when the clock is stopped', () => {
    expect(remainingAt({ remainingMs: 50_000, runningSince: null }, 999_999)).toBe(50_000);
  });

  it('subtracts elapsed time while running', () => {
    expect(remainingAt({ remainingMs: 180_000, runningSince: 1_000 }, 31_000)).toBe(150_000);
  });

  it('never goes below zero', () => {
    expect(remainingAt({ remainingMs: 1_000, runningSince: 0 }, 5_000)).toBe(0);
  });
});

describe('settle', () => {
  it('leaves a running clock untouched before expiry', () => {
    const state = fencing();
    expect(settle(state, 179_999)).toBe(state);
  });

  it('never expires a stopped clock', () => {
    const state = fencing({ clock: { remainingMs: 10_000, runningSince: null } });
    expect(settle(state, 10_000_000)).toBe(state);
  });

  it('starts the period break at the moment of expiry, not at the settle time', () => {
    const settled = settle(fencing(), 200_000);
    expect(settled.phase).toEqual({
      kind: 'break',
      breakKind: 'period',
      period: 1,
      endsAt: 240_000,
      resumeRemainingMs: null,
    });
    expect(settled.clock).toEqual({ remainingMs: 0, runningSince: null });
  });

  it('ends the break into the next period with a full, stopped clock', () => {
    const settled = settle(fencing(), 300_000);
    expect(settled.phase).toEqual({ kind: 'fencing', period: 2 });
    expect(settled.clock).toEqual({ remainingMs: 180_000, runningSince: null });
  });

  it('is deterministic: settling in two steps equals settling once', () => {
    const once = settle(fencing(), 300_000);
    const twice = settle(settle(fencing(), 200_000), 300_000);
    expect(twice).toEqual(once);
  });

  it('resumes the same period after a mid-bout break with remaining time preserved', () => {
    const state = fencing({
      phase: {
        kind: 'break',
        breakKind: 'mid-bout',
        period: 2,
        endsAt: 5_000,
        resumeRemainingMs: 70_000,
      },
      clock: { remainingMs: 0, runningSince: null },
    });
    expect(settle(state, 4_999)).toBe(state);
    const resumed = settle(state, 5_000);
    expect(resumed.phase).toEqual({ kind: 'fencing', period: 2 });
    expect(resumed.clock).toEqual({ remainingMs: 70_000, runningSince: null });
  });

  it('finishes with the leader when the last period expires', () => {
    const state = fencing({
      phase: { kind: 'fencing', period: 3 },
      score: { left: 4, right: 7 },
    });
    expect(settle(state, 180_000).phase).toEqual({
      kind: 'finished',
      winner: 'right',
      reason: 'time',
    });
  });

  it('goes to the priority draw when the last period expires tied', () => {
    const state = fencing({
      phase: { kind: 'fencing', period: 3 },
      score: { left: 6, right: 6 },
    });
    const settled = settle(state, 180_000);
    expect(settled.phase).toEqual({ kind: 'priority-draw' });
    expect(settled.clock).toEqual({ remainingMs: 0, runningSince: null });
  });

  it('honors a single-period format', () => {
    const state = fencing({ score: { left: 5, right: 2 } }, 'epee', { periods: 1, touchLimit: 5 });
    expect(settle(state, 180_000).phase).toEqual({
      kind: 'finished',
      winner: 'left',
      reason: 'time',
    });
  });

  it('awards the priority side when the extra period expires without a touch', () => {
    const state = fencing({
      phase: { kind: 'extra-period' },
      clock: { remainingMs: 60_000, runningSince: 1_000 },
      score: { left: 6, right: 6 },
      priority: 'left',
    });
    expect(settle(state, 61_000).phase).toEqual({
      kind: 'finished',
      winner: 'left',
      reason: 'priority',
    });
  });

  it('does not change a finished bout', () => {
    const state = fencing({ phase: { kind: 'finished', winner: 'left', reason: 'time' } });
    expect(settle(state, 9_999_999)).toBe(state);
  });
});
