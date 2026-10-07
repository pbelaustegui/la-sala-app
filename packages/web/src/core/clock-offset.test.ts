import { describe, expect, it } from 'vitest';
import { ClockOffset } from './clock-offset';

describe('ClockOffset', () => {
  it('starts with no correction and no known error bound', () => {
    const clock = new ClockOffset();
    expect(clock.offsetMs).toBe(0);
    expect(clock.errorBoundMs).toBeNull();
    expect(clock.correctedNow(5_000)).toBe(5_000);
  });

  it('estimates offset as serverTime minus the round-trip midpoint', () => {
    const clock = new ClockOffset();
    // Phone clock is 60 s behind: it reads 1_000..1_100 while the server reads 61_050.
    clock.observe({ requestStart: 1_000, requestEnd: 1_100, serverTime: 61_050 });
    expect(clock.offsetMs).toBe(60_000);
    expect(clock.errorBoundMs).toBe(50);
    expect(clock.correctedNow(2_000)).toBe(62_000);
  });

  it('corrects a skewed phone clock in the other direction too', () => {
    const clock = new ClockOffset();
    clock.observe({ requestStart: 500_000, requestEnd: 500_040, serverTime: 100_020 });
    // The server stamped at the round-trip midpoint (client time 500_020).
    expect(clock.correctedNow(500_020)).toBe(100_020);
  });

  it('keeps the sample with the smallest round trip', () => {
    const clock = new ClockOffset();
    clock.observe({ requestStart: 0, requestEnd: 1_000, serverTime: 5_500 }); // rtt 1000, offset 5000
    clock.observe({ requestStart: 10_000, requestEnd: 10_040, serverTime: 15_020 }); // rtt 40, offset 5000
    clock.observe({ requestStart: 20_000, requestEnd: 20_800, serverTime: 25_900 }); // rtt 800, offset 5500
    expect(clock.offsetMs).toBe(5_000);
    expect(clock.errorBoundMs).toBe(20);
  });

  it('prefers the newer sample on a tie in round trip', () => {
    const clock = new ClockOffset();
    clock.observe({ requestStart: 0, requestEnd: 100, serverTime: 1_050 });
    clock.observe({ requestStart: 0, requestEnd: 100, serverTime: 2_050 });
    expect(clock.offsetMs).toBe(2_000);
  });

  it('ignores impossible samples', () => {
    const clock = new ClockOffset();
    clock.observe({ requestStart: 100, requestEnd: 50, serverTime: 1_000 });
    clock.observe({ requestStart: 0, requestEnd: Number.NaN, serverTime: 1_000 });
    clock.observe({ requestStart: 0, requestEnd: 10, serverTime: Number.POSITIVE_INFINITY });
    expect(clock.offsetMs).toBe(0);
    expect(clock.errorBoundMs).toBeNull();
  });
});
