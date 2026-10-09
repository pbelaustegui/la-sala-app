import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { PWA_OPTIONS } from './pwa.config.ts';

const SERVER = 'http://localhost:3000';

export default defineConfig({
  plugins: [svelte(), VitePWA(PWA_OPTIONS)],
  server: {
    proxy: {
      '/pistes': SERVER,
      '/admin': SERVER,
      '/health': SERVER,
    },
  },
});
