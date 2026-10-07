import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config';

const BACKGROUND = '#0b1020';

/**
 * Generates the PNG icons from public/icon.svg into public/ (run `npm run icons -w packages/web`).
 * The generated files are committed, so building the app does not need this tool.
 * Maskable and Apple icons get the dark brand background instead of the preset's white.
 */
export default defineConfig({
  preset: {
    ...minimal2023Preset,
    maskable: { ...minimal2023Preset.maskable, resizeOptions: { background: BACKGROUND, fit: 'contain' } },
    apple: { ...minimal2023Preset.apple, resizeOptions: { background: BACKGROUND, fit: 'contain' } },
  },
  images: ['public/icon.svg'],
});
