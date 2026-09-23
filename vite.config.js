import { defineConfig } from 'vite';

export default defineConfig({
  // three + postprocessing + N8AO land in one ~1 MB chunk; that's expected.
  build: { chunkSizeWarningLimit: 1200 },
});
