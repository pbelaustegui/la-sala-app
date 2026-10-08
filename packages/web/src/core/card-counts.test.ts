import { describe, expect, it } from 'vitest';
import { countCards } from './card-counts';

describe('countCards', () => {
  it('starts every side at zero', () => {
    expect(countCards([])).toEqual({
      left: { yellow: 0, red: 0, black: 0 },
      right: { yellow: 0, red: 0, black: 0 },
    });
  });

  it('counts each card type per side', () => {
    const counts = countCards([
      { side: 'left', card: 'yellow', at: 1 },
      { side: 'left', card: 'yellow', at: 2 },
      { side: 'right', card: 'red', at: 3 },
      { side: 'left', card: 'black', at: 4 },
    ]);
    expect(counts.left).toEqual({ yellow: 2, red: 0, black: 1 });
    expect(counts.right).toEqual({ yellow: 0, red: 1, black: 0 });
  });
});
