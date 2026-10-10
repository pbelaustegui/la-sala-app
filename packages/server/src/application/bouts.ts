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
        const snapshot = await this.snapshotFor(id);
        return { id, status: snapshot.bout?.phase.kind ?? 'idle' };
      }),
    );
  }

  async getSnapshot(pisteId: string): Promise<SnapshotResult> {
    if (!(await this.deps.repository.findPiste(pisteId))) return { ok: false, reason: 'unknown-piste' };
    return { ok: true, snapshot: await this.snapshotFor(pisteId) };
  }

  startBout(pisteId: string, setup: BoutSetup): Promise<StartBoutResult> {
    return this.queue.run(pisteId, async () => {
      if (!(await this.deps.repository.findPiste(pisteId))) return { ok: false, reason: 'unknown-piste' };
      await this.deps.repository.startBout(pisteId, setup);
      const snapshot = this.snapshotOf({ setup, events: [] }, await this.deps.repository.getFacingAudience(pisteId));
      this.deps.hub.publish(pisteId, snapshot);
      return { ok: true, snapshot };
    });
  }

  /**
   * Sets the piste-level "judge faces the audience" flag and publishes the new snapshot, so open
   * spectator screens mirror (or unmirror) at once. Idempotent; it never touches the bout.
   */
  setFacingAudience(pisteId: string, facing: boolean): Promise<SnapshotResult> {
    return this.queue.run(pisteId, async () => {
      if (!(await this.deps.repository.findPiste(pisteId))) return { ok: false, reason: 'unknown-piste' };
      await this.deps.repository.setFacingAudience(pisteId, facing);
      const snapshot = await this.snapshotFor(pisteId);
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
      const facing = await this.deps.repository.getFacingAudience(pisteId);
      if (fresh.length === 0) return { ok: true, snapshot: this.snapshotOf(record, facing) };

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
      const snapshot = this.snapshotOf(next, facing);
      this.deps.hub.publish(pisteId, snapshot);
      return { ok: true, snapshot };
    });
  }

  /** Current snapshot of every piste, in repository order. Used for the board's initial messages. */
  async listSnapshots(): Promise<readonly { readonly pisteId: string; readonly snapshot: Snapshot }[]> {
    const pistes = await this.deps.repository.listPistes();
    return Promise.all(
      pistes.map(async ({ id }) => ({ pisteId: id, snapshot: await this.snapshotFor(id) })),
    );
  }

  /** Tells live subscribers that the given pistes were just (re)created and hold no bout. */
  announcePistesReset(pisteIds: readonly string[]): void {
    this.deps.hub.publishPistes(pisteIds);
    for (const id of pisteIds) this.deps.hub.publish(id, this.snapshotOf(null, false));
  }

  private async snapshotFor(pisteId: string): Promise<Snapshot> {
    const [record, facing] = await Promise.all([
      this.deps.repository.findBout(pisteId),
      this.deps.repository.getFacingAudience(pisteId),
    ]);
    return this.snapshotOf(record, facing);
  }

  private snapshotOf(record: BoutRecord | null, facingAudience: boolean): Snapshot {
    const serverTime = this.deps.clock.now();
    if (!record) return { serverTime, bout: null, fencers: null, facingAudience };
    const replayed = replay(
      createBout(rulesOf(record.setup)),
      record.events.map((stored) => stored.event),
    );
    if (!replayed.ok) throw new Error('Stored bout no longer replays cleanly');
    return {
      serverTime,
      bout: settle(replayed.state, serverTime),
      fencers: { left: record.setup.left, right: record.setup.right },
      facingAudience,
    };
  }
}

function rulesOf(setup: BoutSetup) {
  return createRules(setup.weapon, setup.options);
}
