import type { KeyValueStorage } from './storage';

const PREFIX = 'la-sala:v1:current:';

/**
 * Which bout this device is running on each piste. The server has no bout id, so the id is
 * chosen by the client and only used to key the local event log.
 */
export class CurrentBoutPointer {
  constructor(private readonly storage: KeyValueStorage) {}

  get(pisteId: string): string | null {
    return this.storage.get(PREFIX + encodeURIComponent(pisteId));
  }

  set(pisteId: string, boutId: string): void {
    this.storage.set(PREFIX + encodeURIComponent(pisteId), boutId);
  }

  clear(pisteId: string): void {
    this.storage.remove(PREFIX + encodeURIComponent(pisteId));
  }
}
