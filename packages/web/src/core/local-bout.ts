import {
  createBout,
  createRules,
  replay,
  settle,
  type BoutState,
  type DomainError,
  type RulesOptions,
  type Weapon,
} from '@la-sala/domain';
import type { ClientEvent } from './event-factory';
import { boutKey, type BoutKeyParts, type KeyValueStorage } from './storage';

/** What the judge configures; mirrors the server's bout setup so it can be posted as is. */
export interface BoutSetup {
  readonly weapon: Weapon;
  readonly options?: RulesOptions;
  readonly left: string;
  readonly right: string;
}

export type LocalBoutError = DomainError | { readonly type: 'duplicate-event'; readonly id: string };

export type AppendResult =
  | { readonly ok: true; readonly state: BoutState }
  | { readonly ok: false; readonly error: LocalBoutError };

interface Persisted {
  readonly v: 1;
  readonly setup: BoutSetup;
  /** Server snapshot the log continues from; null means a fresh bout. */
  readonly base: BoutState | null;
  readonly events: readonly ClientEvent[];
  /** Length of the acknowledged prefix of `events`. */
  readonly syncedCount: number;
}

function isPersisted(value: unknown): value is Persisted {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Partial<Persisted>;
  return (
    v.v === 1 &&
    typeof v.setup === 'object' &&
    v.setup !== null &&
    Array.isArray(v.events) &&
    v.events.every((e) => typeof e?.id === 'string' && typeof e?.event?.type === 'string') &&
    typeof v.syncedCount === 'number' &&
    (v.base === null || typeof v.base === 'object')
  );
}

/**
 * Local aggregate of one bout on this device: the persisted event log plus the optimistic
 * state derived from it with the domain's `replay` and `settle`. No rules live here.
 *
 * Events are validated before they are stored, so the log always replays cleanly. The
 * in-memory copy is the source of truth for the session: if storage fails, scoring goes on
 * and `persisted` turns false so the UI can warn the judge.
 */
export class LocalBout {
  private persistedOk = true;

  private constructor(
    readonly storage: KeyValueStorage,
    private readonly key: BoutKeyParts,
    private data: Persisted,
  ) {}

  /** Starts a new bout, replacing anything stored under the same key. */
  static create(storage: KeyValueStorage, key: BoutKeyParts, setup: BoutSetup): LocalBout {
    const bout = new LocalBout(storage, key, { v: 1, setup, base: null, events: [], syncedCount: 0 });
    bout.save();
    return bout;
  }

  /** Loads a stored bout, or null when missing, corrupt or from an unknown version. */
  static load(storage: KeyValueStorage, key: BoutKeyParts): LocalBout | null {
    const raw = storage.get(boutKey(key));
    if (raw === null) return null;
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!isPersisted(parsed)) return null;
      const bout = new LocalBout(storage, key, parsed);
      return bout.replayed().ok ? bout : null;
    } catch {
      return null;
    }
  }

  get setup(): BoutSetup {
    return this.data.setup;
  }

  /** False once a write failed: the bout works but would be lost on reload. */
  get persisted(): boolean {
    return this.persistedOk;
  }

  events(): readonly ClientEvent[] {
    return this.data.events;
  }

  /** Events not yet acknowledged by the server, in order. */
  pending(): readonly ClientEvent[] {
    return this.data.events.slice(this.data.syncedCount);
  }

  /** Optimistic state at the (corrected) time `now`. */
  state(now: number): BoutState {
    const replayed = this.replayed();
    // The log only ever holds events that replayed cleanly, so a failure is a bug.
    if (!replayed.ok) throw new Error('Local event log no longer replays cleanly');
    return settle(replayed.state, now);
  }

  /** Validates the event against the current log and stores it only when the domain accepts it. */
  append(event: ClientEvent): AppendResult {
    if (this.data.events.some((stored) => stored.id === event.id)) {
      return { ok: false, error: { type: 'duplicate-event', id: event.id } };
    }
    const events = [...this.data.events, event];
    const result = replay(this.baseState(), events.map((stored) => stored.event));
    if (!result.ok) return { ok: false, error: result.error.error };
    this.data = { ...this.data, events };
    this.save();
    return { ok: true, state: result.state };
  }

  /** Marks the first `count` events as acknowledged (clamped to the log length). */
  markSynced(count: number): void {
    const syncedCount = Math.min(Math.max(this.data.syncedCount, count), this.data.events.length);
    if (syncedCount === this.data.syncedCount) return;
    this.data = { ...this.data, syncedCount };
    this.save();
  }

  /** Server wins: drops the local log (and undo history) and continues from the snapshot. */
  resetTo(snapshot: BoutState): void {
    this.data = { ...this.data, base: snapshot, events: [], syncedCount: 0 };
    this.save();
  }

  private baseState(): BoutState {
    return this.data.base ?? createBout(createRules(this.data.setup.weapon, this.data.setup.options));
  }

  private replayed() {
    return replay(this.baseState(), this.data.events.map((stored) => stored.event));
  }

  private save(): void {
    this.persistedOk = this.storage.set(boutKey(this.key), JSON.stringify(this.data));
  }
}
