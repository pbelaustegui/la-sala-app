import type { BoutRecord, BoutSetup, Piste, PisteRepository, StoredEvent } from '../../application/ports';

interface PisteBouts {
  current: BoutRecord | null;
  archived: BoutRecord[];
}

export class MemoryPisteRepository implements PisteRepository {
  private pistes: readonly Piste[] = [];
  private readonly bouts = new Map<string, PisteBouts>();
  private readonly facing = new Set<string>();

  async listPistes(): Promise<readonly Piste[]> {
    return this.pistes.map((piste) => ({ ...piste }));
  }

  async findPiste(id: string): Promise<Piste | null> {
    const piste = this.pistes.find((candidate) => candidate.id === id);
    return piste ? { ...piste } : null;
  }

  async replacePistes(pistes: readonly Piste[]): Promise<void> {
    this.pistes = pistes.map((piste) => ({ ...piste }));
    this.bouts.clear();
    this.facing.clear();
  }

  async findBout(pisteId: string): Promise<BoutRecord | null> {
    const current = this.bouts.get(pisteId)?.current;
    return current ? structuredClone(current) : null;
  }

  async startBout(pisteId: string, setup: BoutSetup): Promise<void> {
    const entry = this.bouts.get(pisteId) ?? { current: null, archived: [] };
    if (entry.current) entry.archived.push(entry.current);
    entry.current = { setup: structuredClone(setup), events: [] };
    this.bouts.set(pisteId, entry);
  }

  async appendEvents(pisteId: string, events: readonly StoredEvent[]): Promise<void> {
    const current = this.bouts.get(pisteId)?.current;
    if (!current) throw new Error(`No current bout on piste ${pisteId}`);
    const ids = new Set(current.events.map((stored) => stored.id));
    for (const { id } of events) {
      if (ids.has(id)) throw new Error(`Event id ${id} already stored`);
      ids.add(id);
    }
    // Validated above, so the assignment below is all-or-nothing.
    const entry = this.bouts.get(pisteId)!;
    entry.current = { setup: current.setup, events: [...current.events, ...structuredClone(events)] };
  }

  async listArchivedBouts(pisteId: string): Promise<readonly BoutRecord[]> {
    return structuredClone(this.bouts.get(pisteId)?.archived ?? []);
  }

  async getFacingAudience(pisteId: string): Promise<boolean> {
    return this.facing.has(pisteId);
  }

  async setFacingAudience(pisteId: string, facing: boolean): Promise<void> {
    if (!this.pistes.some((piste) => piste.id === pisteId)) throw new Error(`Unknown piste ${pisteId}`);
    if (facing) this.facing.add(pisteId);
    else this.facing.delete(pisteId);
  }
}
