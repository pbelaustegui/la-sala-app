import { describe, expect, it } from 'vitest';
import { apply, type BoutEvent } from './apply';
import { createBout, type BoutState } from './bout';
import { replay } from './replay';
import { createRules } from './rules';

const seeded = () => createBout(createRules('foil'), { left: 'Ana', right: 'Bea' });

function ok(state: BoutState, event: BoutEvent): BoutState {
  const result = apply(state, event);
  if (!result.ok) throw new Error(`expected ok, got ${JSON.stringify(result.error)}`);
  return result.state;
}

describe('names-set', () => {
  it('seeds names from createBout and defaults to null', () => {
    expect(seeded().names).toEqual({ left: 'Ana', right: 'Bea' });
    expect(createBout(createRules('foil')).names).toBeNull();
  });

  it('replaces the names (trimmed) without touching clock, score or phase', () => {
    let state = ok(seeded(), { type: 'clock-started', at: 0 });
    state = ok(state, { type: 'touch-scored', side: 'left', at: 1_000 });
    const renamed = ok(state, { type: 'names-set', left: '  Carla ', right: 'Dora', at: 2_000 });
    expect(renamed.names).toEqual({ left: 'Carla', right: 'Dora' });
    expect(renamed.clock).toEqual(state.clock);
    expect(renamed.score).toEqual(state.score);
    expect(renamed.phase).toEqual(state.phase);
  });

  it('works on a finished bout and keeps it finished', () => {
    let state = ok(seeded(), { type: 'clock-started', at: 0 });
    state = ok(state, { type: 'clock-stopped', at: 1_000 });
    state = ok(state, { type: 'state-set', score: { left: 15, right: 0 }, at: 1_500 });
    expect(state.phase.kind).toBe('finished');
    const renamed = ok(state, { type: 'names-set', left: 'X', right: 'Y', at: 2_000 });
    expect(renamed.phase).toEqual(state.phase);
    expect(renamed.names).toEqual({ left: 'X', right: 'Y' });
  });

  it.each([
    ['empty', '', 'ok'],
    ['blank', '   ', 'ok'],
    ['too long', 'x'.repeat(101), 'ok'],
  ])('rejects a %s name', (_label, bad, other) => {
    expect(apply(seeded(), { type: 'names-set', left: bad, right: other, at: 1 })).toEqual({
      ok: false,
      error: { type: 'names-invalid' },
    });
    expect(apply(seeded(), { type: 'names-set', left: other, right: bad, at: 1 }).ok).toBe(false);
  });

  it('accepts exactly 100 characters', () => {
    const name = 'x'.repeat(100);
    expect(ok(seeded(), { type: 'names-set', left: name, right: 'B', at: 1 }).names?.left).toBe(name);
  });

  it('is reverted by undo in replay', () => {
    const result = replay(seeded(), [
      { type: 'names-set', left: 'C', right: 'D', at: 1 },
      { type: 'undo', at: 2 },
    ]);
    expect(result.ok && result.state.names).toEqual({ left: 'Ana', right: 'Bea' });
  });
});
