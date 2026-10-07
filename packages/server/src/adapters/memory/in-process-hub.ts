import type { BoardChange, ChangeHub, Snapshot } from '../../application/ports';

type Listener = (snapshot: Snapshot) => void;
type BoardListener = (change: BoardChange) => void;

export class InProcessHub implements ChangeHub {
  private readonly listeners = new Map<string, Set<Listener>>();
  private readonly boardListeners = new Set<BoardListener>();

  publish(pisteId: string, snapshot: Snapshot): void {
    // Copy so listeners may unsubscribe while we iterate.
    for (const listener of [...(this.listeners.get(pisteId) ?? [])]) {
      try {
        listener(snapshot);
      } catch {
        // One broken subscriber must not affect the others nor the judge's request.
      }
    }
    this.notifyBoard({ kind: 'snapshot', pisteId, snapshot });
  }

  publishPistes(pisteIds: readonly string[]): void {
    this.notifyBoard({ kind: 'pistes', pisteIds });
  }

  subscribeAll(listener: BoardListener): () => void {
    this.boardListeners.add(listener);
    return () => void this.boardListeners.delete(listener);
  }

  subscribe(pisteId: string, listener: Listener): () => void {
    const set = this.listeners.get(pisteId) ?? new Set<Listener>();
    set.add(listener);
    this.listeners.set(pisteId, set);
    return () => {
      set.delete(listener);
      if (set.size === 0 && this.listeners.get(pisteId) === set) this.listeners.delete(pisteId);
    };
  }

  /** Mostly for tests and diagnostics: how many streams are attached to a piste. */
  subscriberCount(pisteId: string): number {
    return this.listeners.get(pisteId)?.size ?? 0;
  }

  /** Mostly for tests and diagnostics: how many board streams are attached. */
  boardSubscriberCount(): number {
    return this.boardListeners.size;
  }

  private notifyBoard(change: BoardChange): void {
    for (const listener of [...this.boardListeners]) {
      try {
        listener(change);
      } catch {
        // Same isolation as per-piste listeners.
      }
    }
  }
}
