import type { KeyValueStorage } from './storage';

const PREFIX = 'la-sala:v1:pin:';

/**
 * Remembers the judge PIN of each piste for this browser session only (the app passes a
 * sessionStorage adapter), so a reload does not ask again but closing the tab forgets it.
 * The PIN is never logged and never leaves the `x-piste-pin` header.
 */
export class PinStore {
  constructor(private readonly storage: KeyValueStorage) {}

  get(pisteId: string): string | null {
    return this.storage.get(PREFIX + encodeURIComponent(pisteId));
  }

  set(pisteId: string, pin: string): void {
    this.storage.set(PREFIX + encodeURIComponent(pisteId), pin);
  }

  forget(pisteId: string): void {
    this.storage.remove(PREFIX + encodeURIComponent(pisteId));
  }
}
