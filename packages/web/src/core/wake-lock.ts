import { Observable } from './observable';

/** The part of `WakeLockSentinel` we use. */
export interface WakeLockSentinelLike {
  release(): Promise<void>;
  addEventListener(type: 'release', listener: () => void): void;
}

/** `navigator.wakeLock`, or null where the Screen Wake Lock API does not exist. */
export interface WakeLockPort {
  request(type: 'screen'): Promise<WakeLockSentinelLike>;
}

export interface VisibilitySource {
  isVisible(): boolean;
  /** Calls back when the page is shown or hidden. Returns an unsubscribe. */
  onChange(callback: () => void): () => void;
}

export type WakeLockStatus = 'unsupported' | 'inactive' | 'active' | 'denied';

/**
 * Keeps the screen awake while a bout is running.
 *
 * The browser drops the lock whenever the page is hidden, so it is re-requested when the
 * page becomes visible again. Requests can be rejected (battery saver, permissions policy);
 * that is reported as `denied` and never thrown, because scoring must go on regardless.
 */
export class WakeLockController extends Observable<WakeLockStatus> {
  private wanted = false;
  private sentinel: WakeLockSentinelLike | null = null;
  private requesting = false;
  private readonly unsubscribe: () => void;

  constructor(
    private readonly port: WakeLockPort | null,
    private readonly visibility: VisibilitySource,
  ) {
    super(port === null ? 'unsupported' : 'inactive');
    this.unsubscribe = visibility.onChange(() => void this.sync());
  }

  async setWanted(wanted: boolean): Promise<void> {
    this.wanted = wanted;
    await this.sync();
  }

  dispose(): void {
    this.unsubscribe();
    this.wanted = false;
    void this.release();
  }

  private async sync(): Promise<void> {
    if (this.port === null) return;
    if (!this.wanted) {
      await this.release();
      return;
    }
    if (this.sentinel !== null || this.requesting || !this.visibility.isVisible()) return;
    this.requesting = true;
    try {
      const sentinel = await this.port.request('screen');
      sentinel.addEventListener('release', () => {
        if (this.sentinel === sentinel) {
          this.sentinel = null;
          this.set('inactive');
        }
      });
      this.sentinel = sentinel;
      this.set('active');
      // Wanted may have turned off while the request was in flight.
      if (!this.wanted) await this.release();
    } catch {
      this.set('denied');
    } finally {
      this.requesting = false;
    }
  }

  private async release(): Promise<void> {
    const sentinel = this.sentinel;
    this.sentinel = null;
    if (this.port !== null) this.set('inactive');
    try {
      await sentinel?.release();
    } catch {
      // Already released by the system; nothing to do.
    }
  }
}
