import type { Piste, PisteRepository } from '../../application/ports';

export class MemoryPisteRepository implements PisteRepository {
  private pistes: readonly Piste[] = [];

  async listPistes(): Promise<readonly Piste[]> {
    return this.pistes.map((piste) => ({ ...piste }));
  }

  async findPiste(id: string): Promise<Piste | null> {
    const piste = this.pistes.find((candidate) => candidate.id === id);
    return piste ? { ...piste } : null;
  }

  async replacePistes(pistes: readonly Piste[]): Promise<void> {
    this.pistes = pistes.map((piste) => ({ ...piste }));
  }
}
