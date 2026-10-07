import type { BoutState } from '@la-sala/domain';
import type { ApiClient, ApiError, ApiResult, Snapshot } from './api-client';
import { ConnectionStore, INITIAL_CONNECTION, type AttentionReason, type ConnectionState } from './connection-store';
import type { ClientEvent } from './event-factory';

/** Injected timer functions so retries are driven by tests, not by real time. */
export interface Timers {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

/** What the queue needs from the local aggregate (`LocalBout` satisfies it). */
export interface SyncSource {
  events(): readonly ClientEvent[];
  pending(): readonly ClientEvent[];
  markSynced(count: number): void;
  resetTo(snapshot: BoutState): void;
}

export interface BackoffOptions {
  readonly baseMs: number;
  readonly maxMs: number;
}

export interface SyncQueueDeps {
  readonly pisteId: string;
  readonly pin: string;
  readonly source: SyncSource;
  readonly api: Pick<ApiClient, 'submitEvents' | 'getSnapshot'>;
  readonly timers: Timers;
  /** Uniform [0, 1) source for jitter. */
  readonly random: () => number;
  /** Client clock in epoch ms; only used to tell the UI when the next retry happens. */
  readonly now: () => number;
  /** Server limit is 500 events per request. */
  readonly maxBatch?: number;
  readonly backoff?: BackoffOptions;
}

export const MAX_BATCH = 500;
export const DEFAULT_BACKOFF: BackoffOptions = { baseMs: 1_000, maxMs: 30_000 };

/**
 * Sends the local event log to the server, in order, as batches.
 *
 * - Transient failures (network, 5xx) keep the events and retry with exponential backoff
 *   plus jitter, so a venue full of phones does not retry in lockstep.
 * - 401, 429 and other permanent answers stop the queue and say why; a human action
 *   (`setPin`, `retryNow`) resumes it. Hammering a locked PIN would only extend the lockout.
 * - 422 means local and server state diverged: the server snapshot wins, local history is
 *   dropped and the judge is told.
 * - Retries are safe: ids are stable, the server skips ids it stored, and we only advance
 *   the acknowledged prefix after a 2xx.
 */
export class SyncQueue {
  readonly connection = new ConnectionStore();

  private pin: string;
  private running = false;
  private current: Promise<void> = Promise.resolve();
  private timer: unknown = null;
  private stopped = false;
  private attempts = 0;
  private status: ConnectionState = INITIAL_CONNECTION;

  constructor(private readonly deps: SyncQueueDeps) {
    this.pin = deps.pin;
    this.publish({});
  }

  /** New local events are available. No-op while waiting for a retry, stopped or already sending. */
  kick(): void {
    this.publish({});
    if (this.stopped || this.timer !== null || this.running) return;
    void this.start();
  }

  /** Sends now: cancels a pending backoff and clears a stop (the human acted or the network is back). */
  retryNow(): Promise<void> {
    this.cancelTimer();
    this.stopped = false;
    return this.start();
  }

  /** Cancels any pending retry and stops sending; the local log is untouched. */
  dispose(): void {
    this.cancelTimer();
    this.stopped = true;
  }

  /** Replaces the PIN after a 401. Call `retryNow` afterwards. */
  setPin(pin: string): void {
    this.pin = pin;
  }

  /** Resolves when no request is in flight. Mostly useful for tests and shutdown. */
  whenIdle(): Promise<void> {
    return this.running ? this.current : Promise.resolve();
  }

  /** Fetches the server snapshot and makes it the local state (server wins). */
  async resync(): Promise<void> {
    if (this.running) return this.current;
    this.running = true;
    this.current = (async () => {
      try {
        await this.resyncFromServer();
      } finally {
        this.running = false;
      }
    })();
    return this.current;
  }

  private start(): Promise<void> {
    if (this.running) return this.current;
    this.running = true;
    this.current = this.run();
    return this.current;
  }

  private async run(): Promise<void> {
    try {
      for (;;) {
        const raw = this.deps.source.pending().slice(0, this.deps.maxBatch ?? MAX_BATCH);
        if (raw.length === 0) {
          this.attempts = 0;
          this.publish({ status: 'online', reason: null, retryAt: null, lastError: null });
          return;
        }
        this.publish({ status: 'syncing', reason: null, retryAt: null });
        const result = await this.deps.api.submitEvents(this.deps.pisteId, this.pin, uniqueById(raw));
        if (!result.ok) {
          await this.onFailure(result.error);
          return;
        }
        const { source } = this.deps;
        source.markSynced(source.events().length - source.pending().length + raw.length);
        this.attempts = 0;
      }
    } finally {
      this.running = false;
    }
  }

  private async onFailure(error: ApiError): Promise<void> {
    switch (error.kind) {
      case 'network':
      case 'server':
        this.scheduleRetry(error);
        return;
      case 'rejected':
        await this.resyncFromServer();
        return;
      case 'rate-limited':
        this.stop({ kind: 'rate-limited', retryAfterMs: error.retryAfterMs }, this.deps.now() + error.retryAfterMs);
        return;
      case 'unauthorized':
      case 'no-bout':
      case 'unknown-piste':
      case 'invalid-request':
        this.stop({ kind: error.kind });
        return;
    }
  }

  private async resyncFromServer(): Promise<void> {
    const result: ApiResult<Snapshot> = await this.deps.api.getSnapshot(this.deps.pisteId);
    if (!result.ok) {
      await this.onFailure(result.error);
      return;
    }
    const { bout } = result.value;
    if (bout === null) {
      this.stop({ kind: 'no-bout' });
      return;
    }
    const discarded = this.deps.source.pending().length;
    this.deps.source.resetTo(bout);
    this.attempts = 0;
    if (discarded > 0) this.stop({ kind: 'resynced', discarded });
    else this.publish({ status: 'online', reason: null, retryAt: null, lastError: null });
  }

  private scheduleRetry(error: ApiError): void {
    const { baseMs, maxMs } = this.deps.backoff ?? DEFAULT_BACKOFF;
    const step = Math.min(maxMs, baseMs * 2 ** this.attempts);
    // Equal jitter: at least half the step (no hot loop), at most the full step.
    const delay = step / 2 + this.deps.random() * (step / 2);
    this.attempts += 1;
    this.publish({ status: 'offline', reason: null, retryAt: this.deps.now() + delay, lastError: error });
    this.timer = this.deps.timers.setTimeout(() => {
      this.timer = null;
      void this.start();
    }, delay);
  }

  private stop(reason: AttentionReason, retryAt: number | null = null): void {
    this.stopped = true;
    this.publish({ status: 'needs-attention', reason, retryAt });
  }

  private cancelTimer(): void {
    if (this.timer === null) return;
    this.deps.timers.clearTimeout(this.timer);
    this.timer = null;
  }

  private publish(patch: Partial<ConnectionState>): void {
    this.status = { ...this.status, ...patch, pending: this.deps.source.pending().length };
    this.connection.set(this.status);
  }
}

function uniqueById(events: readonly ClientEvent[]): ClientEvent[] {
  const seen = new Set<string>();
  return events.filter((event) => {
    if (seen.has(event.id)) return false;
    seen.add(event.id);
    return true;
  });
}
