import { defineConfig } from 'vite';

export default defineConfig({
  // Set BASE_URL env var for GitHub Pages sub-paths, e.g. BASE_URL=/my-repo/
  base: process.env.BASE_URL || '/',

  build: {
    // fonts/ is placed in dist/ by the user; don't let Vite inline or hash them
    assetsInlineLimit: 0,
  },
});
