import type { Clock } from '../../application/ports';

/** The only place in the server that reads the wall clock. */
export class SystemClock implements Clock {
  now(): number {
    return Date.now();
  }
}
