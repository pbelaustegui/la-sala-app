import { registerSW } from 'virtual:pwa-register';
import type { UpdatePort } from '../core/update-notice';

/**
 * Registers the service worker and adapts it to `UpdatePort`. Only `main.ts` imports this
 * module: `virtual:pwa-register` exists in the Vite build but not under Vitest.
 *
 * Returns null where service workers do not exist (old browsers, insecure contexts).
 */
export function registerServiceWorker(): UpdatePort | null {
  if (!('serviceWorker' in navigator)) return null;
  let updateReady: () => void = () => undefined;
  let offlineReady: () => void = () => undefined;
  const update = registerSW({
    onNeedRefresh: () => updateReady(),
    onOfflineReady: () => offlineReady(),
    onRegisterError: (error) => console.error('Service worker registration failed', error),
  });
  return {
    onUpdateReady: (callback) => void (updateReady = callback),
    onOfflineReady: (callback) => void (offlineReady = callback),
    applyUpdate: () => void update(true),
  };
}
