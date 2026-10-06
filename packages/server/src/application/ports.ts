import type { BoutEvent, RulesOptions, Weapon } from '@la-sala/domain';

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
}

/** Produces a candidate PIN. Uniqueness within a piste set is the caller's concern. */
export interface PinGenerator {
  generate(): string;
}

/** Source of wall-clock time in epoch milliseconds. */
export interface Clock {
  now(): number;
}
