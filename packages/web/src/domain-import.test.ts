import { apply, createBout, createRules } from '@la-sala/domain';
import { describe, expect, it } from 'vitest';

describe('@la-sala/domain in the web package', () => {
  it('resolves through the workspace and runs the reducer', () => {
    const state = createBout(createRules('foil'));
    const started = apply(state, { type: 'clock-started', at: 1_000 });
    expect(started.ok).toBe(true);
  });
});
