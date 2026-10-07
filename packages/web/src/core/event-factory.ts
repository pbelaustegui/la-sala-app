import type { BoutEvent } from '@la-sala/domain';

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/** A domain event before it is stamped: everything but `at`. */
export type EventDraft = DistributiveOmit<BoutEvent, 'at'>;

/** A domain event with the client-generated id that makes retries idempotent. */
export interface ClientEvent {
  readonly id: string;
  readonly event: BoutEvent;
}

export interface EventFactoryDeps {
  /** Unique id source (e.g. `crypto.randomUUID`). Injected so tests are deterministic. */
  readonly newId: () => string;
  /** Server-corrected "now" in epoch ms (see `ClockOffset.correctedNow`). */
  readonly now: () => number;
}

/** Creates events with a stable id and the corrected time. The id never changes on retry. */
export class EventFactory {
  constructor(private readonly deps: EventFactoryDeps) {}

  create(draft: EventDraft): ClientEvent {
    return { id: this.deps.newId(), event: { ...draft, at: this.deps.now() } as BoutEvent };
  }
}
