import type { Clock, PinGenerator } from '../application/ports';

/** Deterministic PIN generator: returns the queued PINs, then increments from 1000. */
export class SequentialPinGenerator implements PinGenerator {
  private next = 1000;

  constructor(private readonly queued: string[] = []) {}

  generate(): string {
    const queued = this.queued.shift();
    if (queued !== undefined) return queued;
    return String(this.next++);
  }
}

export class FakeClock implements Clock {
  constructor(private current = 1_000_000) {}

  now(): number {
    return this.current;
  }

  set(value: number): void {
    this.current = value;
  }

  advance(ms: number): void {
    this.current += ms;
  }
}
