import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    globalSetup: ['./test/global-setup.ts'],
    fileParallelism: false,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: 'file:./test.db',
      JWT_SECRET: 'test-only-secret-that-is-at-least-32-characters-long',
      CORS_ORIGIN: 'http://localhost:3000',
      JWT_EXPIRES_IN: '1h',
    },
  },
});
