import { describe, expect, it } from 'vitest';
import { LocalBout, type BoutSetup } from '../core/local-bout';
import { MemoryStorage } from '../core/storage';
import { FakeTimers } from '../testing/fake-timers';
import { canToggleCard } from '../core/scoreboard-view';
import { ScoreboardController } from './scoreboard-controller';

const T0 = 1_000_000;

function harness(setup: BoutSetup = { weapon: 'epee', left: 'Ana', right: 'Bea' }) {
  let now = T0;
  let counter = 0;
  const bout = LocalBout.create(new MemoryStorage(), { pisteId: 'p1', boutId: 'b1' }, setup);
  let kicks = 0;
  const controller = new ScoreboardController({
    bout,
    now: () => now,
    newId: () => `e${++counter}`,
    sync: { kick: () => void (kicks += 1) },
  });
  return {
    bout,
    controller,
    kicks: () => kicks,
    advance: (ms: number) => void (now += ms),
    setNow: (value: number) => void (now = value),
  };
}

describe('ScoreboardController', () => {
  it('starts with the scheduled view, nothing to undo and nothing pending', () => {
    const { controller } = harness();
    const view = controller.get();
    expect(view.phase).toBe('scheduled');
    expect(view.canUndo).toBe(false);
    expect(view.persisted).toBe(true);
    expect(view.error).toBeNull();
  });

  describe('double tap guard', () => {
    function fencing() {
      const h = harness();
      h.controller.toggleClock();
      h.advance(1_000);
      h.controller.touch('left');
      return h;
    }

    it('ignores a second touch of the same fencer within 1 second', () => {
      const h = fencing();
      const kicks = h.kicks();
      h.advance(999);
      h.controller.touch('left');
      expect(h.controller.get().score).toEqual({ left: 1, right: 0 });
      expect(h.bout.events().filter((e) => e.event.type === 'touch-scored')).toHaveLength(1);
      expect(h.kicks()).toBe(kicks);
      expect(h.controller.get().error).toBeNull();
    });

    it('accepts the same fencer again once 1 second has passed', () => {
      const h = fencing();
      h.advance(1_000);
      h.controller.touch('left');
      expect(h.controller.get().score).toEqual({ left: 2, right: 0 });
    });

    it('accepts the other fencer right away', () => {
      const h = fencing();
      h.advance(100);
      h.controller.touch('right');
      expect(h.controller.get().score).toEqual({ left: 1, right: 1 });
    });

    it('accepts the same fencer right after an undo', () => {
      const h = fencing();
      h.advance(100);
      h.controller.undo();
      h.advance(100);
      h.controller.touch('left');
      expect(h.controller.get().score).toEqual({ left: 1, right: 0 });
      expect(h.bout.events().at(-1)?.event).toMatchObject({ type: 'touch-scored', side: 'left' });
    });
  });

  describe('bout-ending red card', () => {
    function fencing() {
      const h = harness({ weapon: 'foil', options: { touchLimit: 2 }, left: 'Ana', right: 'Bea' });
      h.controller.toggleClock();
      h.advance(1_000);
      return h;
    }

    it('flags the red card that would give the last touch, only while fencing', () => {
      expect(harness().controller.get().redWouldFinish).toEqual({ left: false, right: false });
      const h = fencing();
      expect(h.controller.get().redWouldFinish).toEqual({ left: false, right: false });
      h.controller.touch('right');
      expect(h.controller.get().redWouldFinish).toEqual({ left: true, right: false });
    });

    it('lets the penalized fencer take back the red card that finished the bout, reopening it', () => {
      const h = fencing();
      h.controller.touch('right');
      h.advance(1_000);
      h.controller.toggleCard('left', 'red');
      expect(h.controller.get().result).toEqual({ winner: 'right', reason: 'touch-limit' });
      expect(canToggleCard(h.controller.get(), 'left', 'red')).toBe(true);
      expect(canToggleCard(h.controller.get(), 'right', 'red')).toBe(false);
      expect(canToggleCard(h.controller.get(), 'left', 'yellow')).toBe(false);

      h.advance(1_000);
      h.controller.toggleCard('left', 'red');
      const view = h.controller.get();
      expect(view.result).toBeNull();
      expect(view.phase).toBe('fencing');
      expect(view.score).toEqual({ left: 0, right: 1 });
      expect(view.cards).toEqual([]);
      expect(h.bout.events().at(-1)?.event).toMatchObject({ type: 'card-removed', side: 'left', card: 'red' });
    });

    it('keeps an earlier red card locked when a regular touch finished the bout', () => {
      const h = fencing();
      h.controller.giveCard('left', 'red');
      h.advance(1_000);
      h.controller.toggleClock();
      h.advance(1_000);
      h.controller.touch('right');
      expect(h.controller.get().result).toEqual({ winner: 'right', reason: 'touch-limit' });
      expect(canToggleCard(h.controller.get(), 'left', 'red')).toBe(false);
    });

    it('lets the penalized fencer take back the red card that decided sudden death', () => {
      const h = harness({
        weapon: 'foil',
        options: { touchLimit: 2, periods: 1, periodDurationMs: 10_000 },
        left: 'Ana',
        right: 'Bea',
      });
      h.controller.toggleClock();
      h.advance(11_000);
      h.controller.refresh();
      h.controller.drawPriority('left');
      h.controller.toggleClock();
      h.advance(1_000);
      h.controller.toggleCard('left', 'red');
      expect(h.controller.get().result).toEqual({ winner: 'right', reason: 'sudden-death' });
      expect(canToggleCard(h.controller.get(), 'left', 'red')).toBe(true);
      expect(canToggleCard(h.controller.get(), 'right', 'red')).toBe(false);

      h.advance(1_000);
      h.controller.toggleCard('left', 'red');
      const view = h.controller.get();
      expect(view.phase).toBe('extra-period');
      expect(view.score).toEqual({ left: 0, right: 0 });
      expect(view.result).toBeNull();
      expect(view.priority).toBe('left');
      expect(view.clockRunning).toBe(false);
    });

    it('still offers the take-back on a bout resumed from its snapshot', () => {
      const h = fencing();
      h.controller.touch('right');
      h.advance(1_000);
      h.controller.toggleCard('left', 'red');
      expect(h.controller.get().result).toEqual({ winner: 'right', reason: 'touch-limit' });

      const now = T0 + 2_000;
      const bout = LocalBout.create(
        new MemoryStorage(),
        { pisteId: 'p1', boutId: 'b2' },
        { weapon: 'foil', options: { touchLimit: 2 }, left: 'Ana', right: 'Bea' },
      );
      bout.resetTo(JSON.parse(JSON.stringify(h.bout.state(now))));
      const controller = new ScoreboardController({ bout, now: () => now, newId: () => 'r1', sync: { kick: () => undefined } });
      expect(canToggleCard(controller.get(), 'left', 'red')).toBe(true);

      controller.toggleCard('left', 'red');
      const view = controller.get();
      expect(view.phase).toBe('fencing');
      expect(view.score).toEqual({ left: 0, right: 1 });
      expect(view.result).toBeNull();
    });
  });

  describe('swapSides', () => {
    it('swaps the fencers while the bout has not started, as an undoable names-set', () => {
      const h = harness();
      expect(h.controller.get().canSwapSides).toBe(true);
      h.controller.swapSides();
      expect(h.controller.get().names).toEqual({ left: 'Bea', right: 'Ana' });
      expect(h.bout.events().at(-1)?.event).toEqual({ type: 'names-set', left: 'Bea', right: 'Ana', at: T0 });
      expect(h.controller.get().phase).toBe('scheduled');
      h.controller.undo();
      expect(h.controller.get().names).toEqual({ left: 'Ana', right: 'Bea' });
    });

    it('is not offered once the clock started and stores nothing', () => {
      const h = harness();
      h.controller.toggleClock();
      const before = h.bout.events().length;
      expect(h.controller.get().canSwapSides).toBe(false);
      h.controller.swapSides();
      expect(h.controller.get().names).toEqual({ left: 'Ana', right: 'Bea' });
      expect(h.bout.events()).toHaveLength(before);
    });
  });

  describe('setNames', () => {
    it('exposes the setup names, renames without stopping the clock and stores a names-set event', () => {
      const h = harness();
      expect(h.controller.get().names).toEqual({ left: 'Ana', right: 'Bea' });
      h.controller.toggleClock();
      h.advance(1_000);
      expect(h.controller.setNames('Cris', ' Dora ')).toBe(true);
      expect(h.controller.get().names).toEqual({ left: 'Cris', right: 'Dora' });
      expect(h.controller.get().clockRunning).toBe(true);
      expect(h.bout.events().at(-1)?.event).toEqual({ type: 'names-set', left: 'Cris', right: ' Dora ', at: T0 + 1_000 });
      expect(h.kicks()).toBe(2);
      h.controller.undo();
      expect(h.controller.get().names).toEqual({ left: 'Ana', right: 'Bea' });
    });

    it('refuses invalid names and keeps the log clean', () => {
      const h = harness();
      expect(h.controller.setNames('  ', 'Dora')).toBe(false);
      expect(h.controller.get().error).toBe('names-invalid');
      expect(h.bout.events()).toEqual([]);
    });
  });

  it('scores a touch with the corrected time, stores it locally and kicks the sync', () => {
    const h = harness();
    h.controller.toggleClock();
    h.advance(5_000);
    h.controller.touch('left');

    expect(h.controller.get().score).toEqual({ left: 1, right: 0 });
    expect(h.bout.events().map((e) => e.event)).toEqual([
      { type: 'clock-started', at: T0 },
      { type: 'touch-scored', side: 'left', at: T0 + 5_000 },
    ]);
    expect(h.bout.pending().map((e) => e.id)).toEqual(['e1', 'e2']);
    expect(h.kicks()).toBe(2);
  });

  it('start and stop toggle with the clock state', () => {
    const h = harness();
    h.controller.toggleClock();
    expect(h.controller.get().clockRunning).toBe(true);
    h.advance(1_000);
    h.controller.toggleClock();
    expect(h.controller.get().clockRunning).toBe(false);
    expect(h.bout.events().map((e) => e.event.type)).toEqual(['clock-started', 'clock-stopped']);
  });

  it('rejects a move the domain refuses, keeps the log clean and does not kick', () => {
    const h = harness({ weapon: 'foil', left: 'Ana', right: 'Bea' });
    h.controller.toggleClock();
    const kicks = h.kicks();
    h.controller.doubleTouch();
    expect(h.bout.events()).toHaveLength(1);
    expect(h.kicks()).toBe(kicks);
    expect(h.controller.get().error).toBe('double-touch-not-allowed');
  });

  it('clears the error after the next successful action', () => {
    const h = harness();
    h.controller.touch('left');
    expect(h.controller.get().error).toBe('invalid-phase');
    h.controller.toggleClock();
    expect(h.controller.get().error).toBeNull();
  });

  it('records epee double touches', () => {
    const h = harness();
    h.controller.toggleClock();
    h.controller.doubleTouch();
    expect(h.controller.get().score).toEqual({ left: 1, right: 1 });
  });

  it('undo reverts the last action and is unavailable once nothing is left to revert', () => {
    const h = harness();
    h.controller.toggleClock();
    h.advance(1_000);
    h.controller.touch('right');
    expect(h.controller.get().canUndo).toBe(true);

    h.advance(1_000);
    h.controller.undo();
    expect(h.controller.get().score).toEqual({ left: 0, right: 0 });
    h.controller.undo();
    expect(h.controller.get().phase).toBe('scheduled');
    expect(h.controller.get().canUndo).toBe(false);

    const events = h.bout.events().length;
    h.controller.undo();
    expect(h.bout.events()).toHaveLength(events);
  });

  it('never stamps an event before the previous one, even if the clock estimate moves back', () => {
    const h = harness();
    h.controller.toggleClock();
    h.advance(2_000);
    h.controller.touch('left');
    // A better clock sample corrects the estimate backwards by one second.
    h.setNow(T0 + 1_000);
    h.controller.touch('right');

    const stamps = h.bout.events().map((e) => e.event.at);
    expect(stamps).toEqual([T0, T0 + 2_000, T0 + 2_000]);
    expect(h.controller.get().score).toEqual({ left: 1, right: 1 });
  });

  it('gives cards to a side', () => {
    const h = harness();
    h.controller.toggleClock();
    h.controller.giveCard('left', 'yellow');
    h.controller.giveCard('right', 'red');
    expect(h.controller.get().cards.map((c) => `${c.side}:${c.card}`)).toEqual(['left:yellow', 'right:red']);
    expect(h.controller.get().score).toEqual({ left: 1, right: 0 });
  });

  it('skips a break', () => {
    const h = harness();
    h.controller.toggleClock();
    h.advance(181_000);
    h.controller.refresh();
    expect(h.controller.get().phase).toBe('break');
    h.controller.skipBreak();
    expect(h.controller.get().phase).toBe('fencing');
    expect(h.controller.get().phaseLabel.params).toEqual({ period: 2, periods: 3 });
  });

  it('draws priority for the side the judge picked', () => {
    const h = harness({ weapon: 'foil', options: { periods: 1 }, left: 'Ana', right: 'Bea' });
    h.controller.toggleClock();
    h.advance(181_000);
    h.controller.refresh();
    expect(h.controller.get().awaitingPriority).toBe(true);
    h.controller.drawPriority('right');
    expect(h.controller.get().phase).toBe('extra-period');
    expect(h.controller.get().priority).toBe('right');
  });

  describe('setState', () => {
    it('applies a correction, updating the view, the log and the sync', () => {
      const h = harness();
      h.controller.toggleClock();
      h.advance(10_000);
      h.controller.touch('left');
      const kicks = h.kicks();
      h.advance(1_000);

      expect(h.controller.setState({ score: { left: 0, right: 0 }, remainingMs: 120_000 })).toBe(true);
      const view = h.controller.get();
      expect(view.score).toEqual({ left: 0, right: 0 });
      expect(view.clockText).toBe('2:00');
      expect(view.clockRunning).toBe(false);
      expect(h.bout.events().at(-1)?.event).toEqual({
        type: 'state-set',
        score: { left: 0, right: 0 },
        remainingMs: 120_000,
        at: T0 + 11_000,
      });
      expect(h.kicks()).toBe(kicks + 1);
    });

    it('clears the cards of both fencers and undo brings them back', () => {
      const h = harness();
      h.controller.toggleClock();
      h.controller.giveCard('left', 'yellow');
      expect(h.controller.get().cards).toHaveLength(1);
      h.controller.giveCard('right', 'yellow');
      h.advance(1_000);

      expect(h.controller.setState({ clearCards: true })).toBe(true);
      expect(h.controller.get().cards).toEqual([]);
      expect(h.bout.events().at(-1)?.event).toMatchObject({ type: 'state-set', clearCards: true });

      h.advance(1_000);
      h.controller.undo();
      expect(h.controller.get().cards).toHaveLength(2);
    });

    it('rejects an invalid correction, leaving the state and the log untouched', () => {
      const h = harness();
      h.controller.toggleClock();
      const events = h.bout.events().length;
      const kicks = h.kicks();

      expect(h.controller.setState({ remainingMs: 999_999_999 })).toBe(false);
      expect(h.controller.get().error).toBe('state-set-invalid-remaining');
      expect(h.controller.get().errorParams).toEqual({ maxMs: 180_000 });
      expect(h.bout.events()).toHaveLength(events);
      expect(h.kicks()).toBe(kicks);
      expect(h.controller.get().clockRunning).toBe(true);

      expect(h.controller.setState({})).toBe(false);
      expect(h.controller.get().error).toBe('state-set-empty');
    });

    it('undo reverts a correction', () => {
      const h = harness();
      h.controller.toggleClock();
      h.advance(1_000);
      h.controller.touch('right');
      h.advance(1_000);
      h.controller.setState({ score: { left: 5, right: 5 } });
      expect(h.controller.get().score).toEqual({ left: 5, right: 5 });

      h.advance(1_000);
      h.controller.undo();
      expect(h.controller.get().score).toEqual({ left: 0, right: 1 });
    });

    it('reopens a finished bout and undo restores the result', () => {
      const h = harness({ weapon: 'foil', options: { touchLimit: 1 }, left: 'Ana', right: 'Bea' });
      h.controller.toggleClock();
      h.advance(1_000);
      h.controller.touch('left');
      expect(h.controller.get().phase).toBe('finished');
      expect(h.controller.get().canScore).toBe(false);

      h.advance(1_000);
      expect(h.controller.setState({ score: { left: 0, right: 0 } })).toBe(true);
      expect(h.controller.get().phase).toBe('fencing');
      expect(h.controller.get().result).toBeNull();
      expect(h.controller.get().canScore).toBe(true);

      h.advance(1_000);
      h.controller.undo();
      expect(h.controller.get().phase).toBe('finished');
      expect(h.controller.get().score).toEqual({ left: 1, right: 0 });
    });

    it('exposes what the correction form starts from', () => {
      const h = harness();
      expect(h.controller.get().correction).toEqual({
        period: 1,
        periods: 3,
        remainingMs: 180_000,
        periodDurationMs: 180_000,
        extraPeriodDurationMs: 60_000,
        inExtraPeriod: false,
      });
    });
  });

  it('refresh shows the clock moving without touching the log', () => {
    const h = harness();
    h.controller.toggleClock();
    expect(h.controller.get().clockText).toBe('3:00');
    h.advance(30_000);
    h.controller.refresh();
    expect(h.controller.get().clockText).toBe('2:30');
    expect(h.bout.events()).toHaveLength(1);
  });

  it('reports when the bout can no longer be saved on this device', () => {
    const failing = {
      get: () => null,
      set: () => false,
      remove: () => undefined,
    };
    const bout = LocalBout.create(failing, { pisteId: 'p1', boutId: 'b1' }, { weapon: 'foil', left: 'A', right: 'B' });
    const controller = new ScoreboardController({ bout, now: () => T0, newId: () => 'x', sync: { kick: () => undefined } });
    expect(controller.get().persisted).toBe(false);
  });

  it('ticks with the injected timers and stops cleanly', () => {
    const h = harness();
    h.controller.toggleClock();
    const timers = new FakeTimers();
    const stop = h.controller.startTicking(timers);
    expect(timers.scheduled.size).toBe(1);

    h.advance(10_000);
    timers.fireAll();
    expect(h.controller.get().clockText).toBe('2:50');
    expect(timers.scheduled.size).toBe(1);

    stop();
    expect(timers.scheduled.size).toBe(0);
  });

  describe('compact judge actions', () => {
    function fencing() {
      const h = harness();
      h.controller.toggleClock();
      h.advance(1_000);
      return h;
    }

    it('subtracts a point from one side, never below zero', () => {
      const h = fencing();
      h.controller.touch('left');
      h.advance(1_000);
      h.controller.touch('left');
      h.advance(1_000);
      h.controller.subtractPoint('left');
      expect(h.controller.get().score).toEqual({ left: 1, right: 0 });
      expect(h.bout.events().at(-1)?.event).toMatchObject({ type: 'state-set', score: { left: 1, right: 0 } });

      h.controller.subtractPoint('right');
      expect(h.controller.get().score).toEqual({ left: 1, right: 0 });
      expect(h.bout.events().at(-1)?.event).toMatchObject({ type: 'state-set', score: { left: 1, right: 0 } });
    });

    it('does not subtract outside fencing', () => {
      const h = harness();
      const events = h.bout.events().length;
      h.controller.subtractPoint('left');
      expect(h.bout.events()).toHaveLength(events);
    });

    it('resets the bout: 0-0, full clock, period 1, no cards, clock stopped', () => {
      const h = fencing();
      h.controller.touch('left');
      h.controller.giveCard('right', 'yellow');
      h.advance(1_000);
      h.controller.resetBout();
      const view = h.controller.get();
      expect(view.score).toEqual({ left: 0, right: 0 });
      expect(view.cards).toEqual([]);
      expect(view.clockText).toBe('3:00');
      expect(view.clockRunning).toBe(false);
      expect(h.bout.events().at(-1)?.event).toMatchObject({
        type: 'state-set',
        score: { left: 0, right: 0 },
        remainingMs: 180_000,
        period: 1,
        clearCards: true,
      });
    });

    it('records nothing for a preset the stopped clock already shows, so undo never spends a tap on it', () => {
      const h = fencing();
      h.controller.setClockPreset(2);
      h.advance(1_000);
      const events = h.bout.events().length;
      const kicks = h.kicks();
      h.controller.setClockPreset(2);
      expect(h.bout.events()).toHaveLength(events);
      expect(h.kicks()).toBe(kicks);
      expect(h.controller.get().clockText).toBe('2:00');
      h.controller.undo();
      expect(h.controller.get().clockRunning).toBe(true);
    });

    it('records nothing when the stopped clock shows the preset with a fraction of a second left', () => {
      const h = harness();
      h.controller.toggleClock();
      h.advance(60_500);
      h.controller.toggleClock();
      expect(h.controller.get().clockText).toBe('2:00');
      const events = h.bout.events().length;
      h.controller.setClockPreset(2);
      expect(h.bout.events()).toHaveLength(events);
    });

    it('still records a preset before the bout starts, when it matches the full period', () => {
      const h = harness();
      h.controller.setClockPreset(3);
      expect(h.bout.events().at(-1)?.event).toMatchObject({ type: 'state-set', remainingMs: 180_000 });
    });

    it('sets the clock to a preset, capped by the period length', () => {
      const h = fencing();
      h.controller.setClockPreset(2);
      expect(h.controller.get().clockText).toBe('2:00');
      expect(h.controller.get().clockRunning).toBe(false);
      h.controller.setClockPreset(5);
      expect(h.controller.get().clockText).toBe('3:00');
    });

    it('toggles a card: gives it when absent, removes it when present', () => {
      const h = fencing();
      h.controller.toggleCard('left', 'yellow');
      expect(h.controller.get().cards.map((c) => `${c.side}:${c.card}`)).toEqual(['left:yellow']);
      h.controller.toggleCard('right', 'yellow');
      expect(h.controller.get().cards).toHaveLength(2);
      h.advance(1_000);
      h.controller.toggleCard('left', 'yellow');
      expect(h.controller.get().cards.map((c) => `${c.side}:${c.card}`)).toEqual(['right:yellow']);
      expect(h.bout.events().at(-1)?.event).toMatchObject({ type: 'card-removed', side: 'left', card: 'yellow' });
    });

    it('removes the black card of a bout it finished, reopening the bout', () => {
      const h = fencing();
      h.controller.toggleCard('left', 'black');
      expect(h.controller.get().result).toMatchObject({ reason: 'exclusion' });
      h.advance(1_000);
      h.controller.toggleCard('left', 'black');
      expect(h.controller.get().result).toBeNull();
      expect(h.controller.get().canScore).toBe(true);
      expect(h.controller.get().cards).toEqual([]);
      expect(h.bout.events().at(-1)?.event).toMatchObject({ type: 'card-removed', side: 'left', card: 'black' });
    });

    it('keeps every other card locked on a bout finished by a black card', () => {
      const h = fencing();
      h.controller.toggleCard('left', 'black');
      const events = h.bout.events().length;
      h.controller.toggleCard('left', 'yellow');
      h.controller.toggleCard('right', 'black');
      expect(h.bout.events()).toHaveLength(events);
      expect(h.controller.get().result).toMatchObject({ reason: 'exclusion' });
    });
  });
});
