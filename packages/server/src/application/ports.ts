/** A fencing piste and the PIN that lets its judge post events. */
export interface Piste {
  readonly id: string;
  readonly pin: string;
}

/** Persistence port. Implementations must make every method atomic. */
export interface PisteRepository {
  listPistes(): Promise<readonly Piste[]>;
  findPiste(id: string): Promise<Piste | null>;
  /** Discards every current piste (and, in later tasks, its bouts) and stores the new ones. */
  replacePistes(pistes: readonly Piste[]): Promise<void>;
}

/** Produces a candidate PIN. Uniqueness within a piste set is the caller's concern. */
export interface PinGenerator {
  generate(): string;
}

/** Source of wall-clock time in epoch milliseconds. */
export interface Clock {
  now(): number;
}
