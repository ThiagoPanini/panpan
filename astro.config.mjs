import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://thiagopanini.dev',
  compressHTML: true,
  build: {
    inlineStylesheets: 'auto',
  },
  vite: {
    build: {
      cssMinify: true,
    },
  },
});
