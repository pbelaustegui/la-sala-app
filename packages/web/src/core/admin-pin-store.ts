import type { KeyValueStorage } from './storage';

const KEY = 'la-sala:v1:admin-pin';

/** True when an admin PIN is remembered. Checks presence only: the PIN itself is never read out. */
export function hasAdminPin(storage: KeyValueStorage): boolean {
  return storage.get(KEY) !== null;
}

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
