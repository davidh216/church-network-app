import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';

// Smoke test against the dev servers of both apps. Playwright starts them unless they are already
// running locally (CI always starts fresh ones). Override the ports to run next to other servers.
const webPort = Number(process.env.E2E_WEB_PORT ?? 3000);
const apiPort = Number(process.env.E2E_API_PORT ?? 5000);
const baseURL = `http://localhost:${webPort}`;
const apiURL = `http://localhost:${apiPort}`;
const repoRoot = path.join(__dirname, '..');

// Containers that ship browsers under PLAYWRIGHT_BROWSERS_PATH may carry a different Chromium
// build than this @playwright/test version expects, so launch the newest one found there.
function preinstalledChromium(): string | undefined {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (!root || !existsSync(root)) return undefined;
  const builds = readdirSync(root)
    .filter((name) => /^chromium-\d+$/.test(name))
    .sort((a, b) => Number(a.split('-')[1]) - Number(b.split('-')[1]));
  const newest = builds.at(-1);
  if (!newest) return undefined;
  return ['chrome-linux64', 'chrome-linux']
    .map((dir) => path.join(root, newest, dir, 'chrome'))
    .find((file) => existsSync(file));
}

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  // Dev servers compile each route on first request, which can take several seconds.
  timeout: 60_000,
  expect: { timeout: 20_000 },
  use: {
    baseURL,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: { executablePath: preinstalledChromium() },
      },
    },
  ],
  webServer: [
    {
      command: 'npm run -w backend dev',
      cwd: repoRoot,
      url: `${apiURL}/health`,
      env: { PORT: String(apiPort), CORS_ORIGIN: baseURL },
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      command: `npm run -w frontend dev -- --port ${webPort}`,
      cwd: repoRoot,
      url: `${baseURL}/login`,
      env: { API_URL: apiURL },
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
