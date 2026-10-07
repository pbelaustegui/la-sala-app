import { describe, expect, it } from 'vitest';
import { apply, type BoutEvent } from './apply';
import { createBout } from './bout';
import { replay } from './replay';
import { createRules } from './rules';

const foil = () => createBout(createRules('foil'));

function replayOk(initial: ReturnType<typeof foil>, events: readonly BoutEvent[]) {
  const result = replay(initial, events);
  if (!result.ok) throw new Error(`expected ok, got ${JSON.stringify(result.error)}`);
  return result.state;
}

describe('replay', () => {
  it('returns the initial state for no events', () => {
    const initial = foil();
    expect(replayOk(initial, [])).toBe(initial);
  });

  it('folds events exactly like successive apply calls', () => {
    const events: BoutEvent[] = [
      { type: 'clock-started', at: 0 },
      { type: 'touch-scored', side: 'left', at: 10_000 },
      { type: 'touch-scored', side: 'right', at: 15_000 },
    ];
    let manual = foil();
    for (const event of events) {
      const result = apply(manual, event);
      if (!result.ok) throw new Error('unexpected failure');
      manual = result.state;
    }
    expect(replayOk(foil(), events)).toEqual(manual);
  });

  it('is deterministic: the same events always give the same state', () => {
    const events: BoutEvent[] = [
      { type: 'clock-started', at: 0 },
      { type: 'touch-scored', side: 'left', at: 10_000 },
      { type: 'card-given', side: 'right', card: 'yellow', at: 11_000 },
    ];
    expect(replayOk(foil(), events)).toEqual(replayOk(foil(), events));
  });

  it('reports the index and cause of the first failing event', () => {
    const result = replay(foil(), [
      { type: 'clock-started', at: 0 },
      { type: 'clock-started', at: 5 },
      { type: 'touch-scored', side: 'left', at: 10 },
    ]);
    expect(result).toEqual({
      ok: false,
      error: { index: 1, error: { type: 'clock-already-running' } },
    });
  });
});

describe('undo', () => {
  it('reverts the last touch, including the clock stop', () => {
    const state = replayOk(foil(), [
      { type: 'clock-started', at: 0 },
      { type: 'touch-scored', side: 'left', at: 10_000 },
      { type: 'undo', at: 20_000 },
    ]);
    expect(state.score).toEqual({ left: 0, right: 0 });
    expect(state.clock).toEqual({ remainingMs: 180_000, runningSince: 0 });
  });

  it('reverts a bout won by the touch limit, so fencing can continue', () => {
    const initial = { ...foil(), score: { left: 14, right: 3 } };
    const state = replayOk(initial, [
      { type: 'clock-started', at: 0 },
      { type: 'touch-scored', side: 'left', at: 10_000 },
      { type: 'undo', at: 11_000 },
      { type: 'touch-scored', side: 'right', at: 12_000 },
    ]);
    expect(state.score).toEqual({ left: 14, right: 4 });
    expect(state.phase).toEqual({ kind: 'fencing', period: 1 });
  });

  it('can undo several events in a row, back to the scheduled bout', () => {
    const initial = foil();
    const state = replayOk(initial, [
      { type: 'clock-started', at: 0 },
      { type: 'touch-scored', side: 'left', at: 10 },
      { type: 'undo', at: 20 },
      { type: 'undo', at: 30 },
    ]);
    expect(state).toEqual(initial);
  });

  it('has no redo: a new event after undo replaces the undone one', () => {
    const state = replayOk(foil(), [
      { type: 'clock-started', at: 0 },
      { type: 'touch-scored', side: 'left', at: 10 },
      { type: 'undo', at: 20 },
      { type: 'touch-scored', side: 'right', at: 30 },
    ]);
    expect(state.score).toEqual({ left: 0, right: 1 });
  });

  it('reverts the sabre mid-bout break and lets it trigger again', () => {
    const initial = { ...createBout(createRules('sabre')), score: { left: 7, right: 0 } };
    const afterUndo = replayOk(initial, [
      { type: 'clock-started', at: 0 },
      { type: 'touch-scored', side: 'left', at: 10_000 },
      { type: 'undo', at: 11_000 },
    ]);
    expect(afterUndo.phase).toEqual({ kind: 'fencing', period: 1 });
    expect(afterUndo.midBoutBreakTaken).toBe(false);
    const again = replayOk(afterUndo, [{ type: 'touch-scored', side: 'left', at: 12_000 }]);
    expect(again.phase).toMatchObject({ kind: 'break', breakKind: 'mid-bout' });
  });

  it('reverts a red card, restoring score and card list', () => {
    const state = replayOk(foil(), [
      { type: 'clock-started', at: 0 },
      { type: 'card-given', side: 'left', card: 'red', at: 10 },
      { type: 'undo', at: 20 },
    ]);
    expect(state.score).toEqual({ left: 0, right: 0 });
    expect(state.cards).toEqual([]);
  });

  it('fails with nothing-to-undo on a pristine bout, reporting the index', () => {
    expect(replay(foil(), [{ type: 'undo', at: 0 }])).toEqual({
      ok: false,
      error: { index: 0, error: { type: 'nothing-to-undo' } },
    });
  });

  it('rejects an undo whose timestamp goes backwards', () => {
    const result = replay(foil(), [
      { type: 'clock-started', at: 100 },
      { type: 'undo', at: 50 },
    ]);
    expect(result).toEqual({
      ok: false,
      error: { index: 1, error: { type: 'time-went-backwards', lastAt: 100, at: 50 } },
    });
  });

  it('is rejected by apply alone, which has no history', () => {
    expect(apply(foil(), { type: 'undo', at: 0 })).toEqual({
      ok: false,
      error: { type: 'undo-requires-replay' },
    });
  });
});
