import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: { port: 5174 },
  // three.js alone is ~600 kB; one chunk is fine for a prototype.
  build: { chunkSizeWarningLimit: 1000 },
});
