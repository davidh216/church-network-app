import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  // tsconfig keeps `jsx: preserve` for Next.js; tests need the automatic React runtime.
  oxc: { jsx: { runtime: 'automatic' } },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['src/test/setup.ts'],
    restoreMocks: true,
    unstubGlobals: true,
    // A zone west of UTC, so a calendar date shown in local time (the day before) fails a test.
    env: { TZ: 'America/Los_Angeles' },
  },
});
