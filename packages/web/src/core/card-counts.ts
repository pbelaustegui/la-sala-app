import type { Card, CardRecord, Side } from '@la-sala/domain';

export type CardCounts = Readonly<Record<Card, number>>;

/** How many cards of each type every side has received. Pure, so any screen can share it. */
export function countCards(records: readonly CardRecord[]): Readonly<Record<Side, CardCounts>> {
  const counts = {
    left: { yellow: 0, red: 0, black: 0 },
    right: { yellow: 0, red: 0, black: 0 },
  };
  for (const record of records) counts[record.side][record.card]++;
  return counts;
}
