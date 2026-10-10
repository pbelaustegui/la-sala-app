import { getContext } from 'svelte';
import { AdminPinStore } from './core/admin-pin-store';
import { ApiClient, type FetchLike } from './core/api-client';
import { ClockOffset } from './core/clock-offset';
import { EventSourceBoardStream } from './core/board-event-source';
import { CurrentBoutPointer } from './core/current-bout';
import { PinStore } from './core/pin-store';
import type { BoardStreamPort } from './core/spectator-store';
import { LocalStorageAdapter, type KeyValueStorage } from './core/storage';
import type { Timers } from './core/sync-queue';
import type { UpdatePort } from './core/update-notice';
import type { VisibilitySource, WakeLockPort } from './core/wake-lock';

/**
 * Everything the screens need from the outside world. The browser build wires real ports;
 * component tests pass fakes, so no screen touches `window`, `fetch` or storage directly.
 */
/** Writes text to the system clipboard; rejects when the browser does not allow it. */
export interface ClipboardPort {
  writeText(text: string): Promise<void>;
}

export interface AppEnv {
  readonly fetch: FetchLike;
  /** Client clock in epoch ms. */
  readonly now: () => number;
  readonly newId: () => string;
  /** Uniform [0, 1) source (retry jitter). */
  readonly random: () => number;
  readonly timers: Timers;
  /** Survives reloads and restarts: bouts and their event logs. */
  readonly storage: KeyValueStorage;
  /** Cleared when the tab closes: the remembered piste PINs. */
  readonly sessionStorage: KeyValueStorage;
  /** Calls `callback` whenever the browser regains connectivity. Returns an unsubscribe. */
  readonly onOnline: (callback: () => void) => () => void;
  /** Calls `callback` whenever the browser loses connectivity. Returns an unsubscribe. */
  readonly onOffline: (callback: () => void) => () => void;
  /** Calls `callback` when a page is restored from the back/forward cache (`pageshow` with `persisted`). */
  readonly onPageShow: (callback: () => void) => () => void;
  /** Screen Wake Lock API, or null where the browser does not offer it. */
  readonly wakeLock: WakeLockPort | null;
  /** Page visibility, used to re-acquire the wake lock after the tab was hidden. */
  readonly visibility: VisibilitySource;
  /** Service worker news (new version, offline ready), or null without a service worker. */
  readonly updates: UpdatePort | null;
  /** The public board feed (one connection for all pistes). */
  readonly boardStream: BoardStreamPort;
  /** System clipboard. Browsers only offer it in secure contexts (HTTPS or localhost). */
  readonly clipboard: ClipboardPort;
  /** Origin the app is served from (`https://host[:port]`), used to build shareable links. */
  readonly origin: string;
}

export const ENV_KEY = Symbol('la-sala-env');

/** Reads the environment provided by `App`. Only valid during component initialisation. */
export function getEnv(): AppEnv {
  const env = getContext<AppEnv | undefined>(ENV_KEY);
  if (!env) throw new Error('AppEnv is missing: render the screen inside <App>');
  return env;
}

/** Services shared by every screen, built once per environment. */
export interface AppServices {
  readonly env: AppEnv;
  readonly clockOffset: ClockOffset;
  readonly api: ApiClient;
  readonly pins: PinStore;
  readonly adminPin: AdminPinStore;
  readonly pointer: CurrentBoutPointer;
}

export function createServices(env: AppEnv): AppServices {
  const clockOffset = new ClockOffset();
  return {
    env,
    clockOffset,
    api: new ApiClient({ fetch: env.fetch, now: env.now, clockOffset }),
    pins: new PinStore(env.sessionStorage),
    adminPin: new AdminPinStore(env.sessionStorage),
    pointer: new CurrentBoutPointer(env.storage),
  };
}

export const SERVICES_KEY = Symbol('la-sala-services');

export function getServices(): AppServices {
  const services = getContext<AppServices | undefined>(SERVICES_KEY);
  if (!services) throw new Error('Services are missing: render the screen inside <App>');
  return services;
}

function randomId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  // randomUUID needs a secure context; ids only have to be unique per device, not secret.
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Real browser ports. Storage adapters degrade to "nothing persisted" instead of throwing. */
export function createBrowserEnv(target: Window = window): AppEnv {
  return {
    fetch: (input, init) => target.fetch(input, init),
    now: () => Date.now(),
    newId: randomId,
    random: () => Math.random(),
    timers: {
      setTimeout: (fn, ms) => target.setTimeout(fn, ms),
      clearTimeout: (handle) => target.clearTimeout(handle as number),
    },
    storage: new LocalStorageAdapter(() => target.localStorage),
    sessionStorage: new LocalStorageAdapter(() => target.sessionStorage),
    onOnline: (callback) => {
      target.addEventListener('online', callback);
      return () => target.removeEventListener('online', callback);
    },
    onOffline: (callback) => {
      target.addEventListener('offline', callback);
      return () => target.removeEventListener('offline', callback);
    },
    onPageShow: (callback) => {
      const listener = (event: PageTransitionEvent) => {
        if (event.persisted) callback();
      };
      target.addEventListener('pageshow', listener);
      return () => target.removeEventListener('pageshow', listener);
    },
    wakeLock: 'wakeLock' in target.navigator ? (target.navigator.wakeLock as WakeLockPort) : null,
    updates: null,
    boardStream: new EventSourceBoardStream(),
    clipboard: {
      writeText: (text) => {
        const clipboard = target.navigator.clipboard as Clipboard | undefined;
        if (!clipboard) return Promise.reject(new Error('Clipboard unavailable'));
        return clipboard.writeText(text);
      },
    },
    origin: target.location.origin,
    visibility: {
      isVisible: () => target.document.visibilityState !== 'hidden',
      onChange: (callback) => {
        target.document.addEventListener('visibilitychange', callback);
        return () => target.document.removeEventListener('visibilitychange', callback);
      },
    },
  };
}
