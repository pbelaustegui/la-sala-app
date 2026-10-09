import { createBout, createRules, replay, settle, type BoutEvent, type RulesOptions, type Weapon } from '@la-sala/domain';
import { describe, expect, it } from 'vitest';
import { canUndo, formatClock, scoreboardView } from './scoreboard-view';

const T0 = 1_000_000;

function stateAfter(weapon: Weapon, events: BoutEvent[], options?: RulesOptions) {
  const result = replay(createBout(createRules(weapon, options)), events);
  if (!result.ok) throw new Error(`fixture is invalid: ${result.error.error.type}`);
  return result.state;
}

describe('formatClock', () => {
  it.each([
    [180_000, '3:00'],
    [179_001, '3:00'],
    [61_000, '1:01'],
    [60_000, '1:00'],
    [10_000, '0:10'],
    [9_900, '9.9'],
    [9_001, '9.1'],
    [100, '0.1'],
    [0, '0:00'],
    [-500, '0:00'],
  ])('%i ms shows %s (never reaches 0:00 before time is up)', (ms, text) => {
    expect(formatClock(ms)).toBe(text);
  });
});

describe('scoreboardView', () => {
  it('scheduled: full period, start offered, scoring locked', () => {
    const view = scoreboardView(stateAfter('foil', []), T0);
    expect(view.phase).toBe('scheduled');
    expect(view.clockText).toBe('3:00');
    expect(view.clockAction).toBe('start');
    expect(view.canScore).toBe(false);
    expect(view.active).toBe(false);
    expect(view.phaseLabel).toEqual({ key: 'board.phase.scheduled', params: {} });
  });

  it('fencing with the clock running counts down and offers stop', () => {
    const state = stateAfter('foil', [{ type: 'clock-started', at: T0 }]);
    const view = scoreboardView(settle(state, T0 + 20_000), T0 + 20_000);
    expect(view.clockText).toBe('2:40');
    expect(view.clockRunning).toBe(true);
    expect(view.clockAction).toBe('stop');
    expect(view.canScore).toBe(true);
    expect(view.active).toBe(true);
    expect(view.phaseLabel).toEqual({ key: 'board.phase.period', params: { period: 1, periods: 3 } });
  });

  it('a stopped clock offers start again and still allows scoring', () => {
    const state = stateAfter('foil', [
      { type: 'clock-started', at: T0 },
      { type: 'clock-stopped', at: T0 + 5_000 },
    ]);
    const view = scoreboardView(state, T0 + 9_000);
    expect(view.clockText).toBe('2:55');
    expect(view.clockAction).toBe('start');
    expect(view.canScore).toBe(true);
  });

  it('exposes the basis of a manual correction for every kind of phase', () => {
    const running: BoutEvent[] = [{ type: 'clock-started', at: T0 }];
    const fencing = scoreboardView(settle(stateAfter('foil', running), T0 + 20_000), T0 + 20_000);
    expect(fencing.correction).toEqual({
      period: 1,
      periods: 3,
      remainingMs: 160_000,
      periodDurationMs: 180_000,
      extraPeriodDurationMs: 60_000,
      inExtraPeriod: false,
    });

    const brk = scoreboardView(settle(stateAfter('foil', running), T0 + 190_000), T0 + 190_000);
    expect(brk.phase).toBe('break');
    expect(brk.correction).toMatchObject({ period: 1, remainingMs: 0 });

    const finished = stateAfter('foil', [...running, { type: 'clock-stopped', at: T0 }], { touchLimit: 1 });
    const over = replay(finished, [{ type: 'touch-scored', side: 'left', at: T0 + 1 }]);
    if (!over.ok) throw new Error('fixture is invalid');
    expect(scoreboardView(over.state, T0 + 2).correction).toMatchObject({ period: 3, inExtraPeriod: false });
  });

  it('a scheduled bout prefills the correction with a full period', () => {
    // The clock has never started, so it reads 0: leftover time; the sheet must still offer the
    // full period, or a judge correcting before the first touch would get an empty clock.
    const view = scoreboardView(stateAfter('foil', []), T0);
    expect(view.phase).toBe('scheduled');
    expect(view.correction).toEqual({
      period: 1,
      periods: 3,
      remainingMs: 180_000,
      periodDurationMs: 180_000,
      extraPeriodDurationMs: 60_000,
      inExtraPeriod: false,
    });
  });

  it('an extra period keeps the last regular period and flags itself', () => {
    const tied = settle(
      stateAfter('foil', [
        { type: 'clock-started', at: T0 },
        { type: 'touch-scored', side: 'left', at: T0 + 10_000 },
        { type: 'touch-scored', side: 'right', at: T0 + 20_000 },
        { type: 'clock-started', at: T0 + 30_000 },
        { type: 'clock-started', at: T0 + 260_000 },
        { type: 'clock-started', at: T0 + 500_000 },
      ]),
      T0 + 680_000,
    );
    const extra = replay(tied, [{ type: 'priority-drawn', side: 'right', at: T0 + 700_000 }]);
    if (!extra.ok) throw new Error('fixture is invalid');
    const view = scoreboardView(extra.state, T0 + 701_000);
    expect(view.phase).toBe('extra-period');
    // The extra period is not a fourth period in the form, and `apply.ts` hands the bout a fresh
    // stopped one-minute clock when the draw moves it there, so the sheet prefills 1:00 (not the
    // 0:00 of a break or of the priority draw itself). `inExtraPeriod` is what tells it that a
    // clock reset means that same minute and not the regular 3:00.
    expect(view.correction).toEqual({
      period: 3,
      periods: 3,
      remainingMs: 60_000,
      periodDurationMs: 180_000,
      extraPeriodDurationMs: 60_000,
      inExtraPeriod: true,
    });
  });

  it('double touch is only offered for epee', () => {
    const running: BoutEvent[] = [{ type: 'clock-started', at: T0 }];
    const epee = scoreboardView(stateAfter('epee', running), T0);
    const foil = scoreboardView(stateAfter('foil', running), T0);
    expect(epee.doubleTouch).toBe('enabled');
    expect(foil.doubleTouch).toBe('hidden');
    expect(scoreboardView(stateAfter('epee', []), T0).doubleTouch).toBe('disabled');
  });

  it('break shows the countdown and allows skipping', () => {
    const state = settle(stateAfter('foil', [{ type: 'clock-started', at: T0 }]), T0 + 180_000 + 10_000);
    const view = scoreboardView(state, T0 + 190_000);
    expect(view.phase).toBe('break');
    expect(view.clockText).toBe('0:50');
    expect(view.canSkipBreak).toBe(true);
    expect(view.canScore).toBe(false);
    expect(view.clockAction).toBeNull();
    expect(view.phaseLabel.key).toBe('board.phase.break');
  });

  it('the sabre mid-bout break has its own label', () => {
    const state = stateAfter('sabre', [
      { type: 'clock-started', at: T0 },
      ...Array.from({ length: 8 }, (_, i): BoutEvent => ({ type: 'touch-scored', side: 'left', at: T0 + 1_000 * (i + 1) })),
    ]);
    expect(scoreboardView(state, T0 + 9_000).phaseLabel.key).toBe('board.phase.breakMid');
  });

  it('priority draw waits for the judge to pick a side', () => {
    const tied = settle(stateAfter('foil', [{ type: 'clock-started', at: T0 }], { periods: 1 }), T0 + 180_000);
    const view = scoreboardView(tied, T0 + 181_000);
    expect(view.phase).toBe('priority-draw');
    expect(view.awaitingPriority).toBe(true);
    expect(view.canScore).toBe(false);
  });

  it('extra period shows who holds priority', () => {
    const tied = settle(stateAfter('foil', [{ type: 'clock-started', at: T0 }], { periods: 1 }), T0 + 180_000);
    const extra = replay(tied, [{ type: 'priority-drawn', side: 'right', at: T0 + 181_000 }]);
    if (!extra.ok) throw new Error('fixture');
    const view = scoreboardView(extra.state, T0 + 181_000);
    expect(view.phase).toBe('extra-period');
    expect(view.priority).toBe('right');
    expect(view.clockText).toBe('1:00');
    expect(view.canScore).toBe(true);
  });

  it('finished carries the winner and the reason', () => {
    const state = stateAfter('foil', [
      { type: 'clock-started', at: T0 },
      { type: 'touch-scored', side: 'right', at: T0 + 1_000 },
      { type: 'card-given', side: 'left', card: 'black', at: T0 + 2_000 },
    ]);
    const view = scoreboardView(state, T0 + 3_000);
    expect(view.result).toEqual({ winner: 'right', reason: 'exclusion' });
    expect(view.canScore).toBe(false);
    expect(view.clockAction).toBeNull();
    expect(view.active).toBe(false);
    expect(view.score).toEqual({ left: 0, right: 1 });
  });
});

describe('canUndo', () => {
  const at = (n: number) => T0 + n;
  it('is false with nothing applied', () => {
    expect(canUndo([])).toBe(false);
  });

  it('counts applied events minus undos', () => {
    expect(canUndo([{ type: 'clock-started', at: at(0) }])).toBe(true);
    expect(
      canUndo([
        { type: 'clock-started', at: at(0) },
        { type: 'undo', at: at(1) },
      ]),
    ).toBe(false);
  });
});
