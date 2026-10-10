import { describe, expect, it } from 'vitest';
import { LocalBout, type BoutSetup } from '../core/local-bout';
import { MemoryStorage } from '../core/storage';
import { FakeTimers } from '../testing/fake-timers';
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
});
