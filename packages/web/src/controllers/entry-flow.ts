import type { ApiClient, ApiError, Snapshot } from '../core/api-client';
import type { CurrentBoutPointer } from '../core/current-bout';
import { LocalBout, type BoutSetup } from '../core/local-bout';
import { Observable } from '../core/observable';
import type { PinStore } from '../core/pin-store';
import { validateSetupForm, type SetupErrors, type SetupForm } from '../core/setup-form';
import { boutKey, type KeyValueStorage } from '../core/storage';

export type EntryError =
  | { readonly kind: 'invalid-format' }
  | { readonly kind: 'wrong-pin' }
  | { readonly kind: 'locked'; readonly retryAfterMs: number }
  | { readonly kind: 'offline' }
  | { readonly kind: 'unknown-piste' }
  | { readonly kind: 'server' };

export type EntryState =
  | { readonly step: 'pin'; readonly error: EntryError | null }
  | { readonly step: 'checking' }
  /** The piste already has a bout: resume it or start a new one. */
  | { readonly step: 'choose'; readonly left: string; readonly right: string }
  | { readonly step: 'confirm-new' }
  | { readonly step: 'setup'; readonly errors: SetupErrors; readonly failure: EntryError | null; readonly submitting: boolean }
  /** PIN remembered, but the server cannot be reached and this device holds nothing for the piste. */
  | { readonly step: 'offline' }
  | {
      readonly step: 'ready';
      readonly bout: LocalBout;
      readonly boutId: string;
      readonly pin: string;
      /** True when the server could not be reached while opening the piste. */
      readonly offline: boolean;
    };

export interface EntryFlowDeps {
  readonly pisteId: string;
  readonly api: Pick<ApiClient, 'submitEvents' | 'startBout'>;
  readonly pins: PinStore;
  readonly storage: KeyValueStorage;
  readonly pointer: CurrentBoutPointer;
  /** Unique id source for new local bouts. */
  readonly newId: () => string;
}

/** Digits only, long enough to be a PIN and short enough to be typed on a keypad. */
const PIN_FORMAT = /^\d{4,8}$/;

const SETUP_IDLE: EntryState = { step: 'setup', errors: {}, failure: null, submitting: false };

function toEntryError(error: ApiError): EntryError {
  switch (error.kind) {
    case 'unauthorized':
      return { kind: 'wrong-pin' };
    case 'rate-limited':
      return { kind: 'locked', retryAfterMs: error.retryAfterMs };
    case 'network':
      return { kind: 'offline' };
    case 'unknown-piste':
      return { kind: 'unknown-piste' };
    default:
      return { kind: 'server' };
  }
}

/** Setup that reproduces the rules and names of a bout that exists on the server. */
function setupFromSnapshot(snapshot: Snapshot): BoutSetup | null {
  if (snapshot.bout === null) return null;
  const { rules } = snapshot.bout;
  return {
    weapon: rules.weapon,
    options: {
      periods: rules.periods,
      touchLimit: rules.touchLimit,
      periodDurationMs: rules.periodDurationMs,
      breakDurationMs: rules.breakDurationMs,
    },
    left: snapshot.fencers?.left ?? '',
    right: snapshot.fencers?.right ?? '',
  };
}

/**
 * The judge's way into a piste: PIN, then resume or set up a bout. A plain state machine
 * with injected ports, so it is tested without a DOM; the screen only renders `state`.
 *
 * The server has no "check PIN" endpoint, so the PIN is verified with an empty event batch:
 * 401 means wrong, 429 locked, 409 means correct but no bout, 200 correct with a bout.
 */
export class EntryFlow extends Observable<EntryState> {
  private pin = '';
  private snapshot: Snapshot | null = null;

  constructor(private readonly deps: EntryFlowDeps) {
    super({ step: 'pin', error: null });
  }

  /** Opens the piste: uses the remembered PIN when there is one, otherwise asks for it. */
  async start(): Promise<void> {
    const remembered = this.deps.pins.get(this.deps.pisteId);
    if (remembered === null) {
      this.set({ step: 'pin', error: null });
      return;
    }
    await this.verify(remembered, true);
  }

  async submitPin(pin: string): Promise<void> {
    const candidate = pin.trim();
    if (!PIN_FORMAT.test(candidate)) {
      this.set({ step: 'pin', error: { kind: 'invalid-format' } });
      return;
    }
    await this.verify(candidate, false);
  }

  /** Back to the keypad, forgetting the remembered PIN. */
  changePin(): void {
    this.deps.pins.forget(this.deps.pisteId);
    this.set({ step: 'pin', error: null });
  }

  /** Drops in-memory progress (the stored bout and PIN stay). */
  leave(): void {
    this.snapshot = null;
    this.set({ step: 'pin', error: null });
  }

  /** Continues the live bout: this device's own log when it has unsynced events, else the server's state. */
  resume(): void {
    const local = this.loadLocal();
    if (local !== null && local.bout.pending().length > 0) {
      this.set({ step: 'ready', bout: local.bout, boutId: local.boutId, pin: this.pin, offline: false });
      return;
    }
    const setup = this.snapshot ? setupFromSnapshot(this.snapshot) : null;
    if (!this.snapshot?.bout || !setup) {
      this.set(SETUP_IDLE);
      return;
    }
    if (local !== null) this.deps.storage.remove(boutKey({ pisteId: this.deps.pisteId, boutId: local.boutId }));
    const boutId = this.deps.newId();
    const bout = LocalBout.create(this.deps.storage, { pisteId: this.deps.pisteId, boutId }, setup);
    bout.resetTo(this.snapshot.bout);
    this.deps.pointer.set(this.deps.pisteId, boutId);
    this.set({ step: 'ready', bout, boutId, pin: this.pin, offline: false });
  }

  requestNewBout(): void {
    this.set({ step: 'confirm-new' });
  }

  cancelNewBout(): void {
    this.set(this.chooseState());
  }

  /** The judge accepted that the live bout will be archived. */
  confirmNewBout(): void {
    this.set(SETUP_IDLE);
  }

  async startBout(form: SetupForm): Promise<void> {
    const validation = validateSetupForm(form);
    if (!validation.ok) {
      this.set({ step: 'setup', errors: validation.errors, failure: null, submitting: false });
      return;
    }
    this.set({ step: 'setup', errors: {}, failure: null, submitting: true });
    const result = await this.deps.api.startBout(this.deps.pisteId, this.pin, validation.setup);
    if (!result.ok) {
      this.onStartFailure(result.error);
      return;
    }
    const previous = this.loadLocal();
    if (previous !== null) this.deps.storage.remove(boutKey({ pisteId: this.deps.pisteId, boutId: previous.boutId }));
    const boutId = this.deps.newId();
    const bout = LocalBout.create(this.deps.storage, { pisteId: this.deps.pisteId, boutId }, validation.setup);
    this.deps.pointer.set(this.deps.pisteId, boutId);
    this.set({ step: 'ready', bout, boutId, pin: this.pin, offline: false });
  }

  private chooseState(): EntryState {
    return { step: 'choose', left: this.snapshot?.fencers?.left ?? '', right: this.snapshot?.fencers?.right ?? '' };
  }

  private onStartFailure(error: ApiError): void {
    if (error.kind === 'unauthorized') {
      this.deps.pins.forget(this.deps.pisteId);
      this.set({ step: 'pin', error: { kind: 'wrong-pin' } });
      return;
    }
    this.set({ step: 'setup', errors: {}, failure: toEntryError(error), submitting: false });
  }

  private async verify(pin: string, remembered: boolean): Promise<void> {
    this.set({ step: 'checking' });
    const result = await this.deps.api.submitEvents(this.deps.pisteId, pin, []);
    if (result.ok) {
      this.accept(pin, result.value);
      return;
    }
    const { error } = result;
    if (error.kind === 'no-bout') {
      this.accept(pin, null);
    } else if (error.kind === 'unauthorized') {
      this.deps.pins.forget(this.deps.pisteId);
      this.set({ step: 'pin', error: { kind: 'wrong-pin' } });
    } else if (error.kind === 'network' && remembered) {
      this.openOffline(pin);
    } else {
      this.set({ step: 'pin', error: toEntryError(error) });
    }
  }

  private accept(pin: string, snapshot: Snapshot | null): void {
    this.pin = pin;
    this.snapshot = snapshot;
    this.deps.pins.set(this.deps.pisteId, pin);
    this.set(snapshot?.bout ? this.chooseState() : SETUP_IDLE);
  }

  /** The PIN was accepted earlier in this session; with a local bout the judge can keep scoring. */
  private openOffline(pin: string): void {
    this.pin = pin;
    const local = this.loadLocal();
    if (local === null) {
      this.set({ step: 'offline' });
      return;
    }
    this.set({ step: 'ready', bout: local.bout, boutId: local.boutId, pin, offline: true });
  }

  private loadLocal(): { bout: LocalBout; boutId: string } | null {
    const boutId = this.deps.pointer.get(this.deps.pisteId);
    if (boutId === null) return null;
    const bout = LocalBout.load(this.deps.storage, { pisteId: this.deps.pisteId, boutId });
    return bout === null ? null : { bout, boutId };
  }
}
