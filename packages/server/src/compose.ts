import type { Hono } from 'hono';
import { createApp } from './adapters/http/app';
import { MemoryAttemptLimiter } from './adapters/memory/attempt-limiter';
import { InProcessHub } from './adapters/memory/in-process-hub';
import { SqlitePisteRepository } from './adapters/sqlite/sqlite-piste-repository';
import { RandomPinGenerator } from './adapters/system/random-pin-generator';
import { SystemClock } from './adapters/system/system-clock';
import type { Config } from './config';

export interface Composed {
  readonly app: Hono;
  /** Releases the database handle. */
  close(): void;
}

/** Wires the production adapters (SQLite, crypto PINs, system clock) into the HTTP app. */
export function compose(config: Config): Composed {
  const repository = SqlitePisteRepository.open(config.dbPath);
  const clock = new SystemClock();
  const app = createApp({
    adminPin: config.adminPin,
    repository,
    pinGenerator: new RandomPinGenerator(),
    clock,
    hub: new InProcessHub(),
    limiter: new MemoryAttemptLimiter(clock),
    webDist: config.webDist,
  });
  return { app, close: () => repository.close() };
}
