import { describe, expect, it } from 'vitest';
import { ClockOffset } from './clock-offset';
import { EventFactory } from './event-factory';

function setup(clientNow = 1_000) {
  const clock = new ClockOffset();
  clock.observe({ requestStart: 0, requestEnd: 0, serverTime: 10_000 }); // offset +10_000
  let now = clientNow;
  let n = 0;
  const factory = new EventFactory({
    newId: () => `id-${++n}`,
    now: () => clock.correctedNow(now),
  });
  return { factory, advance: (ms: number) => void (now += ms) };
}

describe('EventFactory', () => {
  it('stamps events with the corrected time and a fresh id', () => {
    const { factory } = setup(1_000);
    expect(factory.create({ type: 'touch-scored', side: 'left' })).toEqual({
      id: 'id-1',
      event: { type: 'touch-scored', side: 'left', at: 11_000 },
    });
  });

  it('uses a different id per event and follows the clock', () => {
    const { factory, advance } = setup(1_000);
    const first = factory.create({ type: 'clock-started' });
    advance(250);
    const second = factory.create({ type: 'clock-stopped' });
    expect(first.id).not.toBe(second.id);
    expect(second.event.at).toBe(11_250);
  });

  it('keeps the payload of card and priority events', () => {
    const { factory } = setup();
    expect(factory.create({ type: 'card-given', side: 'right', card: 'red' }).event).toMatchObject({
      side: 'right',
      card: 'red',
    });
  });
});
