import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset paths so the build works from any sub-path
  // (e.g. https://<user>.github.io/<repo>/) or straight from a folder.
  base: './',
  // three + postprocessing + N8AO land in one ~1 MB chunk; that's expected.
  build: { chunkSizeWarningLimit: 1200 },
});
