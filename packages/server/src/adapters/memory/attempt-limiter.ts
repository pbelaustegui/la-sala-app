import type { AttemptLimiter, Clock } from '../../application/ports';

export const MAX_FAILURES = 5;
export const BASE_LOCKOUT_MS = 30_000;
export const MAX_LOCKOUT_MS = 15 * 60_000;

interface Entry {
  failures: number;
  lockouts: number;
  lockedUntil: number;
}

/**
 * In-memory limiter: after `MAX_FAILURES` consecutive failures the key is locked for 30 s,
 * doubling on each further lockout up to 15 min. State is per process and lost on restart.
 */
export class MemoryAttemptLimiter implements AttemptLimiter {
  private readonly entries = new Map<string, Entry>();

  constructor(private readonly clock: Clock) {}

  retryAfterMs(key: string): number {
    const entry = this.entries.get(key);
    return entry ? Math.max(0, entry.lockedUntil - this.clock.now()) : 0;
  }

  recordFailure(key: string): void {
    if (this.retryAfterMs(key) > 0) return;
    const entry = this.entries.get(key) ?? { failures: 0, lockouts: 0, lockedUntil: 0 };
    entry.failures += 1;
    if (entry.failures >= MAX_FAILURES) {
      entry.lockedUntil = this.clock.now() + Math.min(BASE_LOCKOUT_MS * 2 ** entry.lockouts, MAX_LOCKOUT_MS);
      entry.lockouts += 1;
      entry.failures = 0;
    }
    this.entries.set(key, entry);
  }

  recordSuccess(key: string): void {
    if (this.retryAfterMs(key) > 0) return;
    this.entries.delete(key);
  }
}
