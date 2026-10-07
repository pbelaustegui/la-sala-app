import type { ApiError } from './api-client';

/** Why the judge has to do something. Transient failures never appear here. */
export type AttentionReason =
  | { readonly kind: 'unauthorized' }
  | { readonly kind: 'rate-limited'; readonly retryAfterMs: number }
  /** The server rejected the local log; its snapshot replaced it and `discarded` events were dropped. */
  | { readonly kind: 'resynced'; readonly discarded: number }
  | { readonly kind: 'no-bout' }
  | { readonly kind: 'unknown-piste' }
  | { readonly kind: 'invalid-request' };

export type ConnectionStatus = 'online' | 'offline' | 'syncing' | 'needs-attention';

export interface ConnectionState {
  readonly status: ConnectionStatus;
  /** Events stored locally and not yet acknowledged by the server. */
  readonly pending: number;
  readonly reason: AttentionReason | null;
  /** Client time (epoch ms) of the next automatic retry or the end of a rate limit. */
  readonly retryAt: number | null;
  /** Last transport-level problem while offline, for diagnostics. */
  readonly lastError: ApiError | null;
}

export const INITIAL_CONNECTION: ConnectionState = {
  status: 'online',
  pending: 0,
  reason: null,
  retryAt: null,
  lastError: null,
};

type Subscriber = (value: ConnectionState) => void;

/**
 * Minimal observable that satisfies Svelte's store contract (`subscribe` calls back
 * immediately and returns an unsubscribe), so components can use `$connection` without
 * this module depending on Svelte.
 */
export class ConnectionStore {
  private value: ConnectionState = INITIAL_CONNECTION;
  private readonly subscribers = new Set<Subscriber>();

  get(): ConnectionState {
    return this.value;
  }

  set(next: ConnectionState): void {
    if (JSON.stringify(next) === JSON.stringify(this.value)) return;
    this.value = next;
    for (const subscriber of [...this.subscribers]) subscriber(next);
  }

  subscribe(run: Subscriber): () => void {
    this.subscribers.add(run);
    run(this.value);
    return () => void this.subscribers.delete(run);
  }
}
