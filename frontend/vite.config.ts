import { fileURLToPath, URL } from 'node:url';

import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';

// `docs/examples/` lives one level above `frontend/`. It is the shared fixture
// set with the backend, so the mock API adapter imports it directly rather than
// keeping a second copy in sync.
const docsExamples = fileURLToPath(
  new URL('../docs/examples', import.meta.url)
);

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@fixtures': docsExamples,
    },
  },
  server: {
    port: 5173,
    fs: {
      // Allow reading the fixture JSON from outside the Vite root.
      allow: [fileURLToPath(new URL('.', import.meta.url)), docsExamples],
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.{ts,tsx}', 'src/**/*.test.{ts,tsx}'],
  },
});
