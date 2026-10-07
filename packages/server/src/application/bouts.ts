import {
  createBout,
  createRules,
  replay,
  settle,
  type DomainError,
} from '@la-sala/domain';
import { KeyedQueue } from './keyed-queue';
import type { BoutRecord, BoutSetup, ChangeHub, Clock, PisteRepository, Snapshot, StoredEvent } from './ports';

export interface PisteStatus {
  readonly id: string;
  /** `idle` when no bout was started, otherwise the settled phase kind. */
  readonly status: string;
}

export type { Snapshot };

export type StartBoutResult = { readonly ok: true; readonly snapshot: Snapshot } | { readonly ok: false; readonly reason: 'unknown-piste' };

export type SubmitEventsResult =
  | { readonly ok: true; readonly snapshot: Snapshot }
  | { readonly ok: false; readonly reason: 'unknown-piste' | 'no-bout' }
  | { readonly ok: false; readonly reason: 'domain-error'; readonly index: number; readonly error: DomainError };

export type SnapshotResult = { readonly ok: true; readonly snapshot: Snapshot } | { readonly ok: false; readonly reason: 'unknown-piste' };

export interface BoutServiceDeps {
  readonly repository: PisteRepository;
  readonly clock: Clock;
  readonly hub: ChangeHub;
}

/** Use cases around a piste's bout. Free of HTTP, storage and crypto concerns. */
export class BoutService {
  private readonly queue = new KeyedQueue();

  constructor(private readonly deps: BoutServiceDeps) {}

  async listPisteStatuses(): Promise<readonly PisteStatus[]> {
    const pistes = await this.deps.repository.listPistes();
    return Promise.all(
      pistes.map(async ({ id }) => {
        const snapshot = this.snapshotOf(await this.deps.repository.findBout(id));
        return { id, status: snapshot.bout?.phase.kind ?? 'idle' };
      }),
    );
  }

  async getSnapshot(pisteId: string): Promise<SnapshotResult> {
    if (!(await this.deps.repository.findPiste(pisteId))) return { ok: false, reason: 'unknown-piste' };
    const record = await this.deps.repository.findBout(pisteId);
    return { ok: true, snapshot: this.snapshotOf(record) };
  }

  startBout(pisteId: string, setup: BoutSetup): Promise<StartBoutResult> {
    return this.queue.run(pisteId, async () => {
      if (!(await this.deps.repository.findPiste(pisteId))) return { ok: false, reason: 'unknown-piste' };
      await this.deps.repository.startBout(pisteId, setup);
      const snapshot = this.snapshotOf({ setup, events: [] });
      this.deps.hub.publish(pisteId, snapshot);
      return { ok: true, snapshot };
    });
  }

  /**
   * Applies a batch in order. Events whose id is already part of the current bout are skipped.
   * The first domain error aborts the whole batch and nothing is persisted.
   */
  submitEvents(pisteId: string, batch: readonly StoredEvent[]): Promise<SubmitEventsResult> {
    return this.queue.run(pisteId, async () => {
      if (!(await this.deps.repository.findPiste(pisteId))) return { ok: false, reason: 'unknown-piste' };
      const record = await this.deps.repository.findBout(pisteId);
      if (!record) return { ok: false, reason: 'no-bout' };

      const known = new Set(record.events.map((stored) => stored.id));
      const fresh: { stored: StoredEvent; batchIndex: number }[] = [];
      batch.forEach((stored, batchIndex) => {
        if (known.has(stored.id)) return;
        known.add(stored.id);
        fresh.push({ stored, batchIndex });
      });
      if (fresh.length === 0) return { ok: true, snapshot: this.snapshotOf(record) };

      const next: BoutRecord = { setup: record.setup, events: [...record.events, ...fresh.map((f) => f.stored)] };
      const replayed = replay(createBout(rulesOf(next.setup)), next.events.map((stored) => stored.event));
      if (!replayed.ok) {
        const freshIndex = replayed.error.index - record.events.length;
        const failing = fresh[freshIndex];
        // Stored events were valid when persisted and replay is deterministic.
        if (!failing) throw new Error('Stored bout no longer replays cleanly');
        return { ok: false, reason: 'domain-error', index: failing.batchIndex, error: replayed.error.error };
      }

      await this.deps.repository.appendEvents(pisteId, fresh.map((f) => f.stored));
      const snapshot = this.snapshotOf(next);
      this.deps.hub.publish(pisteId, snapshot);
      return { ok: true, snapshot };
    });
  }

  /** Current snapshot of every piste, in repository order. Used for the board's initial messages. */
  async listSnapshots(): Promise<readonly { readonly pisteId: string; readonly snapshot: Snapshot }[]> {
    const pistes = await this.deps.repository.listPistes();
    return Promise.all(
      pistes.map(async ({ id }) => ({ pisteId: id, snapshot: this.snapshotOf(await this.deps.repository.findBout(id)) })),
    );
  }

  /** Tells live subscribers that the given pistes were just (re)created and hold no bout. */
  announcePistesReset(pisteIds: readonly string[]): void {
    this.deps.hub.publishPistes(pisteIds);
    for (const id of pisteIds) this.deps.hub.publish(id, this.snapshotOf(null));
  }

  private snapshotOf(record: BoutRecord | null): Snapshot {
    const serverTime = this.deps.clock.now();
    if (!record) return { serverTime, bout: null, fencers: null };
    const replayed = replay(
      createBout(rulesOf(record.setup)),
      record.events.map((stored) => stored.event),
    );
    if (!replayed.ok) throw new Error('Stored bout no longer replays cleanly');
    return {
      serverTime,
      bout: settle(replayed.state, serverTime),
      fencers: { left: record.setup.left, right: record.setup.right },
    };
  }
}

function rulesOf(setup: BoutSetup) {
  return createRules(setup.weapon, setup.options);
}
