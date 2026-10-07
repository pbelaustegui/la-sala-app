import { Observable } from './observable';

/** What the service worker registration tells the app. Injected so no test needs a browser. */
export interface UpdatePort {
  /** A new version finished installing and is waiting. */
  onUpdateReady(callback: () => void): void;
  /** The app shell is cached: it now opens without a connection. */
  onOfflineReady(callback: () => void): void;
  /** Activates the waiting version and reloads the page. */
  applyUpdate(): void;
}

export interface UpdateNoticeState {
  readonly updateAvailable: boolean;
  readonly offlineReady: boolean;
}

/**
 * Surfaces service worker news to the judge. A new version is never applied by itself:
 * reloading in the middle of a bout is the judge's call, and if they ignore the notice the
 * waiting version takes over the next time the app is opened from scratch.
 */
export class UpdateNotice extends Observable<UpdateNoticeState> {
  constructor(private readonly port: UpdatePort | null) {
    super({ updateAvailable: false, offlineReady: false });
    port?.onUpdateReady(() => this.set({ ...this.get(), updateAvailable: true }));
    port?.onOfflineReady(() => this.set({ ...this.get(), offlineReady: true }));
  }

  apply(): void {
    this.port?.applyUpdate();
  }

  /** Hides the notices. A waiting update stays waiting. */
  dismiss(): void {
    this.set({ updateAvailable: false, offlineReady: false });
  }
}
