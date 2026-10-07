import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';

const SERVER = 'http://localhost:3000';

export default defineConfig({
  plugins: [svelte()],
  server: {
    proxy: {
      '/pistes': SERVER,
      '/admin': SERVER,
      '/health': SERVER,
    },
  },
});
