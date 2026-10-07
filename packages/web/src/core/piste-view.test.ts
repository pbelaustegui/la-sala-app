import { createBout, createRules, replay, type BoutEvent, type BoutState } from '@la-sala/domain';
import { describe, expect, it } from 'vitest';
import { toPisteView } from './piste-view';
import type { BoardEntry } from './spectator-store';

const T0 = 1_000_000;

function bout(events: BoutEvent[], weapon: 'foil' | 'sabre' = 'foil'): BoutState {
  const result = replay(createBout(createRules(weapon)), events);
  if (!result.ok) throw new Error('bad fixture');
  return result.state;
}

/** Client clock is 40 s behind the server: offsetMs = +40_000. */
function entry(state: BoutState | null, overrides: Partial<BoardEntry> = {}): BoardEntry {
  return {
    pisteId: '3',
    snapshot: { serverTime: T0 + 40_000, bout: state, fencers: state ? { left: 'Ana', right: 'Bea' } : null },
    receivedAt: T0,
    offsetMs: 40_000,
    stale: false,
    ...overrides,
  };
}

describe('toPisteView', () => {
  it('shows an idle piste without a bout', () => {
    expect(toPisteView(entry(null), T0)).toMatchObject({
      pisteId: '3', phase: 'idle', fencers: null, score: { left: 0, right: 0 }, remainingMs: null, running: false, stale: false,
    });
  });

  it('shows a scheduled bout with the full period', () => {
    const view = toPisteView(entry(bout([])), T0);
    expect(view).toMatchObject({ phase: 'scheduled', fencers: { left: 'Ana', right: 'Bea' }, running: false, remainingMs: 180_000, period: null, periods: 3 });
  });

  it('shows the score of a stopped clock', () => {
    const state = bout([{ type: 'clock-started', at: T0 }, { type: 'touch-scored', side: 'left', at: T0 + 1 }]);
    expect(toPisteView(entry(state), T0)).toMatchObject({ score: { left: 1, right: 0 }, running: false });
  });

  it('renders a running clock from timestamps in server time, advancing with the client clock', () => {
    const state = bout([{ type: 'clock-started', at: T0 + 40_000 }]);
    const view = toPisteView(entry(state), T0 + 10_000);
    expect(view).toMatchObject({ phase: 'fencing', period: 1, running: true, score: { left: 0, right: 0 } });
    expect(view.remainingMs).toBe(180_000 - 10_000);
  });

  it('settles time-driven transitions with the domain: the period ends and a break counts down', () => {
    const state = bout([{ type: 'clock-started', at: T0 + 40_000 }]);
    const view = toPisteView(entry(state), T0 + 180_000 + 5_000);
    expect(view).toMatchObject({ phase: 'break', running: false, period: 1 });
    expect(view.breakRemainingMs).toBe(60_000 - 5_000);
    expect(view.remainingMs).toBeNull();
  });

  it('exposes card counts per side', () => {
    const state = bout([
      { type: 'clock-started', at: T0 },
      { type: 'card-given', side: 'left', card: 'yellow', at: T0 + 10 },
      { type: 'card-given', side: 'left', card: 'red', at: T0 + 11 },
    ]);
    expect(toPisteView(entry(state), T0 + 20_000).cards).toEqual({
      left: { yellow: 1, red: 1, black: 0 },
      right: { yellow: 0, red: 0, black: 0 },
    });
  });

  it('exposes the winner and reason once the touch limit is reached', () => {
    const state = bout([
      { type: 'clock-started', at: T0 },
      ...Array.from({ length: 15 }, (_, i): BoutEvent => ({ type: 'touch-scored', side: 'right', at: T0 + 1 + i })),
    ], 'foil');
    const view = toPisteView(entry(state), T0 + 20_000);
    expect(view).toMatchObject({ phase: 'finished', winner: 'right', reason: 'touch-limit', running: false, remainingMs: null });
  });

  it('exposes the side holding priority', () => {
    const state: BoutState = { ...bout([]), priority: 'left' };
    expect(toPisteView(entry(state), T0).priority).toBe('left');
  });

  it('freezes a stale entry at its last known time and never reports it running', () => {
    const state = bout([{ type: 'clock-started', at: T0 + 40_000 }]);
    const view = toPisteView(entry(state, { stale: true }), T0 + 100_000);
    expect(view.stale).toBe(true);
    expect(view.running).toBe(false);
    expect(view.remainingMs).toBe(180_000);
  });
});
