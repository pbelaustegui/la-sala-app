import { createBout, createRules, type BoutState } from '@la-sala/domain';
import { describe, expect, it } from 'vitest';
import type { ClientEvent } from './event-factory';
import { LocalBout, type BoutSetup } from './local-bout';
import { MemoryStorage, boutKey, type KeyValueStorage } from './storage';

const key = { pisteId: 'p1', boutId: 'b1' };
const setup: BoutSetup = { weapon: 'foil', left: 'Ana', right: 'Bea' };

let counter = 0;
const ev = (event: ClientEvent['event']): ClientEvent => ({ id: `e${++counter}`, event });
const start = (at = 1_000) => ev({ type: 'clock-started', at });
const touch = (side: 'left' | 'right', at: number) => ev({ type: 'touch-scored', side, at });

function create(storage: KeyValueStorage = new MemoryStorage()) {
  return { storage, bout: LocalBout.create(storage, key, setup) };
}

describe('LocalBout', () => {
  it('starts as a scheduled bout with the rules of the setup', () => {
    const { bout } = create();
    expect(bout.state(0)).toEqual(createBout(createRules('foil')));
    expect(bout.events()).toEqual([]);
  });

  it('applies events optimistically through the domain replay', () => {
    const { bout } = create();
    expect(bout.append(start()).ok).toBe(true);
    const result = bout.append(touch('left', 2_000));
    expect(result.ok && result.state.score).toEqual({ left: 1, right: 0 });
    expect(bout.state(2_000).score).toEqual({ left: 1, right: 0 });
  });

  it('settles the derived state at the corrected now', () => {
    const { bout } = create();
    bout.append(start(1_000));
    const state = bout.state(1_000 + 180_000);
    expect(state.phase.kind).toBe('break');
  });

  it('supports undo through the domain undo event', () => {
    const { bout } = create();
    bout.append(start());
    bout.append(touch('left', 2_000));
    expect(bout.append(ev({ type: 'undo', at: 3_000 })).ok).toBe(true);
    expect(bout.state(3_000).score).toEqual({ left: 0, right: 0 });
    expect(bout.events()).toHaveLength(3);
  });

  it('rejects an invalid event with the domain error and does not persist it', () => {
    const { bout, storage } = create();
    const result = bout.append(touch('left', 500)); // scheduled phase: not allowed
    expect(result).toEqual({
      ok: false,
      error: { type: 'invalid-phase', phase: 'scheduled', event: 'touch-scored' },
    });
    expect(bout.events()).toEqual([]);
    expect(LocalBout.load(storage, key)?.events()).toEqual([]);
  });

  it('rejects undo with nothing to undo', () => {
    const { bout } = create();
    expect(bout.append(ev({ type: 'undo', at: 10 }))).toEqual({
      ok: false,
      error: { type: 'nothing-to-undo' },
    });
  });

  it('rejects an event whose id was already appended', () => {
    const { bout } = create();
    const first = start();
    bout.append(first);
    expect(bout.append(first)).toEqual({ ok: false, error: { type: 'duplicate-event', id: first.id } });
    expect(bout.events()).toHaveLength(1);
  });

  it('persists and reloads the full log', () => {
    const { bout, storage } = create();
    bout.append(start());
    bout.append(touch('right', 2_000));
    const reloaded = LocalBout.load(storage, key);
    expect(reloaded?.events()).toEqual(bout.events());
    expect(reloaded?.setup).toEqual(setup);
    expect(reloaded?.state(2_000)).toEqual(bout.state(2_000));
  });

  it('returns null when nothing is stored or the data is corrupt', () => {
    expect(LocalBout.load(new MemoryStorage(), key)).toBeNull();
    for (const bad of ['not json', '{}', '{"v":1}', 'null', '{"v":99,"setup":{},"events":[]}']) {
      const storage = new MemoryStorage();
      storage.set(boutKey(key), bad);
      expect(LocalBout.load(storage, key)).toBeNull();
    }
  });

  it('keeps working in memory when storage throws', () => {
    const broken: KeyValueStorage = {
      get: () => null,
      set: () => false,
      remove: () => undefined,
    };
    const bout = LocalBout.create(broken, key, setup);
    expect(bout.persisted).toBe(false);
    expect(bout.append(start()).ok).toBe(true);
    expect(bout.append(touch('left', 2_000)).ok).toBe(true);
    expect(bout.state(2_000).score.left).toBe(1);
  });

  describe('sync bookkeeping', () => {
    it('reports unsynced events in order and marks them synced by count', () => {
      const { bout } = create();
      const a = start();
      const b = touch('left', 2_000);
      const c = touch('right', 3_000);
      [a, b, c].forEach((e) => bout.append(e));
      expect(bout.pending()).toEqual([a, b, c]);
      bout.markSynced(2);
      expect(bout.pending()).toEqual([c]);
      expect(LocalBout.load(bout.storage, key)?.pending()).toEqual([c]);
      bout.markSynced(10);
      expect(bout.pending()).toEqual([]);
    });
  });

  describe('server wins', () => {
    const serverState: BoutState = {
      ...createBout(createRules('foil')),
      phase: { kind: 'fencing', period: 1 },
      score: { left: 4, right: 2 },
      clock: { remainingMs: 100_000, runningSince: null },
      lastAt: 50_000,
    };

    it('drops the local history and continues from the snapshot', () => {
      const { bout, storage } = create();
      bout.append(start(1_000));
      bout.append(touch('left', 2_000));
      bout.resetTo(serverState);

      expect(bout.events()).toEqual([]);
      expect(bout.pending()).toEqual([]);
      expect(bout.state(60_000).score).toEqual({ left: 4, right: 2 });
      expect(LocalBout.load(storage, key)?.state(60_000).score).toEqual({ left: 4, right: 2 });

      const next = bout.append(touch('right', 60_000));
      expect(next.ok && next.state.score).toEqual({ left: 4, right: 3 });
    });

    it('cannot undo past the snapshot', () => {
      const { bout } = create();
      bout.resetTo(serverState);
      expect(bout.append(ev({ type: 'undo', at: 60_000 }))).toEqual({
        ok: false,
        error: { type: 'nothing-to-undo' },
      });
    });
  });
});
