import type { Timers } from '../core/sync-queue';

/** Timers that only fire when a test says so, so no test depends on real time. */
export class FakeTimers implements Timers {
  private nextId = 1;
  readonly scheduled = new Map<number, { fn: () => void; ms: number }>();

  setTimeout(fn: () => void, ms: number): number {
    const id = this.nextId++;
    this.scheduled.set(id, { fn, ms });
    return id;
  }

  clearTimeout(handle: unknown): void {
    this.scheduled.delete(handle as number);
  }

  /** Fires every timer scheduled right now (timers they schedule wait for the next call). */
  fireAll(): void {
    const due = [...this.scheduled.entries()];
    for (const [id] of due) this.scheduled.delete(id);
    for (const [, timer] of due) timer.fn();
  }
}
