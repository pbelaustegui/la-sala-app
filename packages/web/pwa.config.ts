import type { VitePWAOptions } from 'vite-plugin-pwa';

const THEME = '#0b1020';

/**
 * PWA settings, kept apart from vite.config.ts so tests can check them.
 *
 * - `registerType: 'prompt'`, no `skipWaiting`, no `clientsClaim`: a new service worker waits
 *   until the judge accepts it or the app is reopened. Nothing reloads the page mid-bout.
 * - Only the app shell is precached. There is NO runtime caching, so every API request goes
 *   to the network untouched (scores must never come from a cache), and navigations to API
 *   paths are not answered with index.html.
 */
export const PWA_OPTIONS: Partial<VitePWAOptions> = {
  registerType: 'prompt',
  injectRegister: false,
  includeAssets: ['icon.svg', 'favicon.ico', 'apple-touch-icon-180x180.png'],
  manifest: {
    name: 'La Sala',
    short_name: 'La Sala',
    description: 'Mesa de juez de esgrima: marcador que funciona sin conexión.',
    lang: 'es',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    theme_color: THEME,
    background_color: THEME,
    icons: [
      { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
      { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
      { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
      { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  },
  workbox: {
    globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest}'],
    navigateFallback: 'index.html',
    navigateFallbackDenylist: [/^\/pistes(\/|$)/, /^\/admin(\/|$)/, /^\/health(\/|$)/],
    cleanupOutdatedCaches: true,
    skipWaiting: false,
    clientsClaim: false,
  },
};
