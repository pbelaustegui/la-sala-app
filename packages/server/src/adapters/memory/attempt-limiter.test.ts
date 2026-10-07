import { beforeEach, describe, expect, it } from 'vitest';
import { FakeClock } from '../../testing/fakes';
import { MemoryAttemptLimiter } from './attempt-limiter';

describe('MemoryAttemptLimiter', () => {
  let clock: FakeClock;
  let limiter: MemoryAttemptLimiter;

  const fail = (key: string, times: number) => {
    for (let i = 0; i < times; i++) limiter.recordFailure(key);
  };

  beforeEach(() => {
    clock = new FakeClock(0);
    limiter = new MemoryAttemptLimiter(clock);
  });

  it('does not lock before 5 failures', () => {
    fail('a', 4);
    expect(limiter.retryAfterMs('a')).toBe(0);
  });

  it('locks for 30 s after 5 failures and counts down with the clock', () => {
    fail('a', 5);
    expect(limiter.retryAfterMs('a')).toBe(30_000);
    clock.advance(10_000);
    expect(limiter.retryAfterMs('a')).toBe(20_000);
  });

  it('restores access when the lockout expires', () => {
    fail('a', 5);
    clock.advance(30_000);
    expect(limiter.retryAfterMs('a')).toBe(0);
  });

  it('doubles each further lockout and caps at 15 minutes', () => {
    const expected = [30, 60, 120, 240, 480, 900, 900];
    for (const seconds of expected) {
      fail('a', 5);
      expect(limiter.retryAfterMs('a')).toBe(seconds * 1000);
      clock.advance(seconds * 1000);
    }
  });

  it('resets the counter on success when not locked out', () => {
    fail('a', 4);
    limiter.recordSuccess('a');
    fail('a', 4);
    expect(limiter.retryAfterMs('a')).toBe(0);
  });

  it('resets the lockout level on success so the next lockout is 30 s again', () => {
    fail('a', 5);
    clock.advance(30_000);
    limiter.recordSuccess('a');
    fail('a', 5);
    expect(limiter.retryAfterMs('a')).toBe(30_000);
  });

  it('ignores a success while locked out', () => {
    fail('a', 5);
    limiter.recordSuccess('a');
    expect(limiter.retryAfterMs('a')).toBe(30_000);
  });

  it('keeps keys independent', () => {
    fail('a', 5);
    expect(limiter.retryAfterMs('b')).toBe(0);
  });
});
