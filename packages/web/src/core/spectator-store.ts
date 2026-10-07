import type { Snapshot } from './api-client';
import { Observable } from './observable';

/** A message of `GET /pistes/stream` (see the server's app.ts for the wire format). */
export type BoardMessage =
  | { readonly kind: 'snapshot'; readonly pisteId: string; readonly snapshot: Snapshot }
  /** The authoritative set of piste ids; any other id is gone. */
  | { readonly kind: 'pistes'; readonly pisteIds: readonly string[] }
  /** Heartbeat of the server: proves the connection is alive and refreshes the clock offset. */
  | { readonly kind: 'ping'; readonly serverTime: number };

export interface BoardStreamHandlers {
  onOpen(): void;
  onMessage(message: BoardMessage): void;
  /** The connection failed or dropped. The store closes the port and decides when to retry. */
  onError(): void;
}

/** One live connection to the board feed. The real adapter wraps `EventSource`. */
export interface BoardStreamPort {
  open(handlers: BoardStreamHandlers): void;
  close(): void;
}

/**
 * `connecting`: first attempt, nothing received yet.
 * `live`: connected.
 * `stale`: the connection dropped (or never worked); entries are the last known data, marked stale.
 */
export type BoardConnection = 'connecting' | 'live' | 'stale';

export interface BoardEntry {
  readonly pisteId: string;
  readonly snapshot: Snapshot;
  /** Client clock (epoch ms) when the latest message for this piste arrived. */
  readonly receivedAt: number;
  /**
   * `snapshot.serverTime - receivedAt`: add it to the client clock to estimate server time.
   * Measured per message, so a changing phone clock self-corrects. The message travelled
   * server -> client before `receivedAt` was read, so the estimate is behind by the one-way
   * latency (the error bound): the board may show a clock slightly AHEAD of the judge's by
   * about that much. Uncorrelated with the judge's own clock offset; fine for a display.
   */
  readonly offsetMs: number;
  readonly stale: boolean;
}

export interface SpectatorState {
  readonly connection: BoardConnection;
  /** Ordered by piste id, numerically. */
  readonly pistes: readonly BoardEntry[];
}

export interface SpectatorDeps {
  readonly port: BoardStreamPort;
  /** Client clock, epoch ms. */
  readonly now: () => number;
  readonly setTimeout: (fn: () => void, ms: number) => unknown;
  readonly clearTimeout: (handle: unknown) => void;
  /** Uniform in [0, 1). */
  readonly random: () => number;
  /** Silence after which the connection counts as dead. Defaults to `WATCHDOG_MS`. */
  readonly watchdogMs?: number;
}

export const BACKOFF_BASE_MS = 1_000;
export const BACKOFF_MAX_MS = 30_000;
/**
 * Three missed heartbeats (the server pings every 15 s). Browsers do not report a connection
 * that died silently (a phone leaving wifi, a NAT dropping the flow), so silence is the signal.
 */
export const WATCHDOG_MS = 45_000;

const byPisteId = (a: BoardEntry, b: BoardEntry): number => {
  const diff = Number(a.pisteId) - Number(b.pisteId);
  return Number.isNaN(diff) || diff === 0 ? a.pisteId.localeCompare(b.pisteId) : diff;
};

/**
 * Latest snapshot of every piste over one injected stream, with reconnect.
 *
 * On a drop the port is closed (so a native `EventSource` never retries behind our back) and a
 * retry is scheduled after `min(30 s, 1 s * 2^attempt)` scaled by jitter in [0.5, 1]. The
 * attempt counter resets once data arrives on a connection. The server sends a snapshot per
 * piste on every connect, so nothing needs replaying.
 *
 * Watchdog: a connection that stays silent for `WATCHDOG_MS` (any message counts, `ping`
 * included) is treated as dead exactly like an error: port closed, entries stale, normal
 * reconnect with backoff. It is armed on every connection attempt, so an attempt that never
 * opens is covered too, and cancelled while a retry is waiting and on `stop`.
 */
export class SpectatorStore {
  private readonly state = new Observable<SpectatorState>({ connection: 'connecting', pistes: [] });
  private entries = new Map<string, BoardEntry>();
  private running = false;
  private attempt = 0;
  private retryHandle: unknown = null;
  private watchdogHandle: unknown = null;
  /** Identifies the current connection so callbacks of a closed one are ignored. */
  private generation = 0;
  /** Client clock of the latest message on the current connection; null until one arrives. */
  private lastMessageAt: number | null = null;

  constructor(private readonly deps: SpectatorDeps) {}

  get(): SpectatorState {
    return this.state.get();
  }

  subscribe(run: (value: SpectatorState) => void): () => void {
    return this.state.subscribe(run);
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.connect();
  }

  stop(): void {
    this.running = false;
    this.generation++;
    this.cancelRetry();
    this.cancelWatchdog();
    this.deps.port.close();
  }

  /**
   * Reconnects now instead of waiting for the backoff or the watchdog: cancels a pending retry,
   * resets the backoff and replaces the (possibly half-dead) connection, so there is never more
   * than one. A no-op while live with a message within the watchdog window, unless `force`:
   * after airplane mode the browser `online` event proves the old connection is dead even
   * though it still looks healthy.
   */
  retryNow(force = false): void {
    if (!this.running) return;
    const silentFor = this.lastMessageAt === null ? Infinity : this.deps.now() - this.lastMessageAt;
    const healthy = this.state.get().connection === 'live' && silentFor < (this.deps.watchdogMs ?? WATCHDOG_MS);
    if (healthy && !force) return;
    this.cancelRetry();
    this.attempt = 0;
    this.deps.port.close();
    this.connect();
  }

  /**
   * The browser reports no network: show the last data as stale right away (frozen clocks)
   * instead of waiting for the watchdog. A reconnect already waiting keeps going.
   */
  markOffline(): void {
    if (!this.running) return;
    if (this.retryHandle === null) this.drop();
    else this.publish('stale');
  }

  private connect(): void {
    this.lastMessageAt = null;
    const generation = ++this.generation;
    const live = (fn: () => void) => () => {
      if (generation === this.generation) fn();
    };
    this.armWatchdog(generation);
    this.deps.port.open({
      onOpen: live(() => this.publish('live')),
      onMessage: (message) => {
        if (generation !== this.generation) return;
        this.attempt = 0;
        this.lastMessageAt = this.deps.now();
        this.armWatchdog(generation);
        this.receive(message);
      },
      onError: live(() => this.drop()),
    });
  }

  private receive(message: BoardMessage): void {
    if (message.kind === 'ping') {
      // Snapshots stay untouched; only the clock estimate is refreshed.
      const offsetMs = message.serverTime - this.deps.now();
      for (const [id, entry] of this.entries) if (!entry.stale) this.entries.set(id, { ...entry, offsetMs });
    } else if (message.kind === 'pistes') {
      const keep = new Set(message.pisteIds);
      for (const id of [...this.entries.keys()]) if (!keep.has(id)) this.entries.delete(id);
    } else {
      const receivedAt = this.deps.now();
      this.entries.set(message.pisteId, {
        pisteId: message.pisteId,
        snapshot: message.snapshot,
        receivedAt,
        offsetMs: message.snapshot.serverTime - receivedAt,
        stale: false,
      });
    }
    this.publish(this.state.get().connection === 'connecting' ? 'live' : this.state.get().connection);
  }

  private drop(): void {
    this.cancelWatchdog();
    this.deps.port.close();
    for (const [id, entry] of this.entries) this.entries.set(id, { ...entry, stale: true });
    this.publish('stale');
    const step = Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** this.attempt);
    this.attempt++;
    this.cancelRetry();
    this.retryHandle = this.deps.setTimeout(() => {
      this.retryHandle = null;
      if (this.running) this.connect();
    }, Math.round(step * (0.5 + 0.5 * this.deps.random())));
  }

  private armWatchdog(generation: number): void {
    this.cancelWatchdog();
    this.watchdogHandle = this.deps.setTimeout(() => {
      this.watchdogHandle = null;
      if (generation === this.generation && this.running) this.drop();
    }, this.deps.watchdogMs ?? WATCHDOG_MS);
  }

  private cancelWatchdog(): void {
    if (this.watchdogHandle !== null) this.deps.clearTimeout(this.watchdogHandle);
    this.watchdogHandle = null;
  }

  private cancelRetry(): void {
    if (this.retryHandle !== null) this.deps.clearTimeout(this.retryHandle);
    this.retryHandle = null;
  }

  private publish(connection: BoardConnection): void {
    this.state.set({ connection, pistes: [...this.entries.values()].sort(byPisteId) });
  }
}
