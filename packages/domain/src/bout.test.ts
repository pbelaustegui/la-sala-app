import { describe, expect, it } from 'vitest';
import { createBout } from './bout';
import { createRules } from './rules';

describe('createBout', () => {
  it('starts scheduled, 0-0, with a stopped clock holding a full period', () => {
    const rules = createRules('foil');
    const bout = createBout(rules);
    expect(bout.rules).toBe(rules);
    expect(bout.phase).toEqual({ kind: 'scheduled' });
    expect(bout.score).toEqual({ left: 0, right: 0 });
    expect(bout.clock).toEqual({ remainingMs: 180_000, runningSince: null });
    expect(bout.priority).toBeNull();
    expect(bout.lastAt).toBeNull();
  });
});
