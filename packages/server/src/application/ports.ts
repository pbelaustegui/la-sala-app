import type { BoutEvent, BoutState, RulesOptions, Weapon } from '@la-sala/domain';

/** A fencing piste and the PIN that lets its judge post events. */
export interface Piste {
  readonly id: string;
  readonly pin: string;
}

/** What a judge provides to start a bout. Rules are derived from it with `createRules`. */
export interface BoutSetup {
  readonly weapon: Weapon;
  readonly options?: RulesOptions;
  readonly left: string;
  readonly right: string;
}

/** A domain event together with the client-generated id used for idempotency. */
export interface StoredEvent {
  readonly id: string;
  readonly event: BoutEvent;
}

/** A bout is persisted as its setup plus the ordered events; state is always a replay. */
export interface BoutRecord {
  readonly setup: BoutSetup;
  readonly events: readonly StoredEvent[];
}

/** Persistence port. Implementations must make every method atomic. */
export interface PisteRepository {
  listPistes(): Promise<readonly Piste[]>;
  findPiste(id: string): Promise<Piste | null>;
  /** Discards every current piste (and, in later tasks, its bouts) and stores the new ones. */
  replacePistes(pistes: readonly Piste[]): Promise<void>;

  /** Current bout of a piste, or null when none was started. */
  findBout(pisteId: string): Promise<BoutRecord | null>;
  /** Starts a new empty bout, archiving the current one if any. */
  startBout(pisteId: string, setup: BoutSetup): Promise<void>;
  /**
   * Appends events to the current bout, all or nothing. Rejects when there is no current bout
   * or when an id is already stored in it.
   */
  appendEvents(pisteId: string, events: readonly StoredEvent[]): Promise<void>;
  /** Archived bouts of a piste, oldest first. */
  listArchivedBouts(pisteId: string): Promise<readonly BoutRecord[]>;

  /**
   * Whether the judge of the piste stands facing the audience, so spectator views mirror the
   * two sides. A property of the piste, not of a bout: it survives new bouts and is reset only
   * when the pistes are replaced. Off for an unknown piste.
   */
  getFacingAudience(pisteId: string): Promise<boolean>;
  /** Rejects when the piste does not exist. */
  setFacingAudience(pisteId: string, facing: boolean): Promise<void>;
}

/** Produces a candidate PIN. Uniqueness within a piste set is the caller's concern. */
export interface PinGenerator {
  generate(): string;
}

/** Source of wall-clock time in epoch milliseconds. */
export interface Clock {
  now(): number;
}

/** Throttles repeated failed PIN checks per key (a piste id). */
export interface AttemptLimiter {
  /** Milliseconds until the key may try again; 0 when it is not locked out. */
  retryAfterMs(key: string): number;
  /** Counts a wrong PIN; enough consecutive failures start a lockout. */
  recordFailure(key: string): void;
  /** Clears the key's history. Ignored while the key is locked out. */
  recordSuccess(key: string): void;
}

/** What spectators receive: the settled state and the server clock to compute their offset. */
export interface Snapshot {
  readonly serverTime: number;
  /** `null` while no bout was started on the piste. */
  readonly bout: BoutState | null;
  readonly fencers: { readonly left: string; readonly right: string } | null;
  /** Piste-level display hint: spectators show the two sides mirrored. Visual only. */
  readonly facingAudience: boolean;
}

/** What an all-pistes subscriber receives: a piste changed, or the set of pistes was replaced. */
export type BoardChange =
  | { readonly kind: 'snapshot'; readonly pisteId: string; readonly snapshot: Snapshot }
  /** The authoritative list of piste ids after `POST /admin/pistes`; subscribers drop any other id. */
  | { readonly kind: 'pistes'; readonly pisteIds: readonly string[] };

/** In-process fan-out of piste changes to live subscribers (SSE streams). */
export interface ChangeHub {
  /** Delivers a snapshot to every current subscriber of the piste and to all-pistes subscribers. Never throws. */
  publish(pisteId: string, snapshot: Snapshot): void;
  /** Returns an idempotent unsubscribe function. */
  subscribe(pisteId: string, listener: (snapshot: Snapshot) => void): () => void;
  /** Tells all-pistes subscribers which pistes exist now. Never throws. */
  publishPistes(pisteIds: readonly string[]): void;
  /** Receives every change on every piste (spectator board). Returns an idempotent unsubscribe function. */
  subscribeAll(listener: (change: BoardChange) => void): () => void;
}
