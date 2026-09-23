import { defineConfig } from 'vite';

export default defineConfig({
  root: 'web',
  base: './',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    // three.js (~740 kB, 187 kB gzipped) is its own lazily loaded chunk for the 3D view.
    chunkSizeWarningLimit: 800,
  },
  worker: { format: 'es' },
});
