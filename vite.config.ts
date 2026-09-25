import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const page = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  root: 'web',
  base: './',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    // three.js (~740 kB, 187 kB gzipped) is its own lazily loaded chunk for the 3D view.
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      input: {
        lab: page('./web/index.html'),
        systemone: page('./web/systemone/index.html'),
        handwriting: page('./web/handwriting/index.html'),
        go1Spike: page('./web/applied/go1-spike/index.html'),
        go1: page('./web/applied/go1/index.html'),
      },
    },
  },
  worker: { format: 'es' },
});
