import type { KeyValueStorage } from './storage';

const KEY = 'la-sala:v1:admin-pin';

/**
 * Remembers the organizer PIN for this browser session only (the app passes a sessionStorage
 * adapter). The PIN is never logged, never rendered and never leaves the `x-admin-pin` header.
 */
export class AdminPinStore {
  constructor(private readonly storage: KeyValueStorage) {}

  get(): string | null {
    return this.storage.get(KEY);
  }

  set(pin: string): void {
    this.storage.set(KEY, pin);
  }

  forget(): void {
    this.storage.remove(KEY);
  }
}
