import type { ApiClient } from './api-client';
import { Observable } from './observable';

export interface PisteFacingState {
  /** Last value known to be stored on the piste. */
  readonly facing: boolean;
  /** A change is being sent: the new value is shown, further changes wait. */
  readonly busy: boolean;
  /** The last change could not be saved and the previous value was restored. */
  readonly failed: boolean;
}

export interface PisteFacingDeps {
  readonly api: Pick<ApiClient, 'getSnapshot' | 'setFacingAudience'>;
  readonly pisteId: string;
  readonly pin: string;
}

/**
 * The judge's handle on the piste-level "facing the audience" flag, which spectators see as a
 * mirrored piste. The flag lives on the server; this only reads and changes it.
 *
 * Offline behaviour (deliberately not queued): a change is shown at once, sent, and if it
 * cannot be saved (network, 5xx, rejected PIN) the last known value comes back and `failed`
 * lets the screen say so. Queueing it would let a stale tap flip the audience's view minutes
 * later, long after the judge forgot about it; one explicit retry by the judge is clearer.
 */
export class PisteFacing {
  private readonly state = new Observable<PisteFacingState>({ facing: false, busy: false, failed: false });

  constructor(private readonly deps: PisteFacingDeps) {}

  get(): PisteFacingState {
    return this.state.get();
  }

  subscribe(run: (value: PisteFacingState) => void): () => void {
    return this.state.subscribe(run);
  }

  /** Reads the stored flag. Silent on failure: the judge keeps the last known value (off at first). */
  async load(): Promise<void> {
    const result = await this.deps.api.getSnapshot(this.deps.pisteId);
    if (!result.ok || this.state.get().busy) return;
    this.state.set({ ...this.state.get(), facing: result.value.facingAudience === true });
  }

  async set(facing: boolean): Promise<void> {
    const before = this.state.get();
    if (before.busy) return;
    this.state.set({ facing, busy: true, failed: false });
    const result = await this.deps.api.setFacingAudience(this.deps.pisteId, this.deps.pin, facing);
    this.state.set(
      result.ok
        ? { facing: result.value.facingAudience === true, busy: false, failed: false }
        : { facing: before.facing, busy: false, failed: true },
    );
  }
}
