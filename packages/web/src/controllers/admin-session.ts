import type { AdminPiste, ApiClient } from '../core/api-client';
import type { AdminPinStore } from '../core/admin-pin-store';
import { Observable } from '../core/observable';

export const MAX_PISTES = 100;

export interface AdminSessionState {
  /** `pin`: asking for the PIN; `offline`: PIN known but the list could not be loaded. */
  readonly step: 'pin' | 'loading' | 'ready' | 'offline';
  readonly pistes: readonly AdminPiste[];
  /** Count waiting for the organizer's explicit confirmation, or null. */
  readonly confirming: number | null;
  /** True while a request is in flight. */
  readonly busy: boolean;
  readonly error: 'wrong-pin' | 'invalid-count' | 'failed' | null;
}

type AdminApi = Pick<ApiClient, 'listAdminPistes' | 'createAdminPistes'>;

/**
 * Organizer flow: enter the admin PIN, see the pistes, replace them with N new ones.
 * Replacing wipes every piste and bout, so it needs `requestCreate` then `confirmCreate`.
 * A 401 forgets the PIN and goes back to PIN entry.
 */
export class AdminSessionController extends Observable<AdminSessionState> {
  constructor(
    private readonly api: AdminApi,
    private readonly pin: AdminPinStore,
  ) {
    super({ step: 'pin', pistes: [], confirming: null, busy: false, error: null });
  }

  /** Loads the list with the remembered PIN, or asks for one. Also the retry from `offline`. */
  async start(): Promise<void> {
    const pin = this.pin.get();
    if (pin === null) {
      this.patch({ step: 'pin' });
      return;
    }
    await this.load(pin);
  }

  async submitPin(raw: string): Promise<void> {
    const pin = raw.trim();
    if (pin === '') return;
    this.pin.set(pin);
    await this.load(pin);
  }

  requestCreate(count: number): void {
    if (!Number.isInteger(count) || count < 1 || count > MAX_PISTES) {
      this.patch({ confirming: null, error: 'invalid-count' });
      return;
    }
    this.patch({ confirming: count, error: null });
  }

  cancelCreate(): void {
    this.patch({ confirming: null });
  }

  async confirmCreate(): Promise<void> {
    const { confirming } = this.get();
    const pin = this.pin.get();
    if (confirming === null || pin === null) return;
    this.patch({ busy: true, error: null });
    const result = await this.api.createAdminPistes(pin, confirming);
    if (result.ok) {
      this.patch({ pistes: result.value, confirming: null, busy: false });
    } else if (result.error.kind === 'unauthorized') {
      this.rejectPin();
    } else {
      this.patch({ confirming: null, busy: false, error: 'failed' });
    }
  }

  /** Forgets the PIN and hides the list. */
  lock(): void {
    this.pin.forget();
    this.set({ step: 'pin', pistes: [], confirming: null, busy: false, error: null });
  }

  private async load(pin: string): Promise<void> {
    this.patch({ step: 'loading', busy: true, error: null });
    const result = await this.api.listAdminPistes(pin);
    if (result.ok) {
      this.patch({ step: 'ready', pistes: result.value, busy: false });
    } else if (result.error.kind === 'unauthorized') {
      this.rejectPin();
    } else {
      this.patch({ step: 'offline', busy: false });
    }
  }

  private rejectPin(): void {
    this.pin.forget();
    this.set({ step: 'pin', pistes: [], confirming: null, busy: false, error: 'wrong-pin' });
  }

  private patch(change: Partial<AdminSessionState>): void {
    this.set({ ...this.get(), ...change });
  }
}
