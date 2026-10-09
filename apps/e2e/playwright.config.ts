import { defineConfig, devices } from '@playwright/test';
import { SERVER_URL, WEB_PORT, WEB_URL } from './support/settings';

const START_TIMEOUT_MS = 120_000;
/** A full match to 10 tokens is some 300 card plays and ten 5-second pauses. */
const TEST_TIMEOUT_MS = 600_000;

export default defineConfig({
  testDir: './tests',
  // One worker, in order: the test server hands out its fixed seeds in sequence,
  // so running in parallel would change which cards each test is dealt.
  fullyParallel: false,
  workers: 1,
  forbidOnly: process.env.CI !== undefined,
  retries: 0,
  timeout: TEST_TIMEOUT_MS,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: WEB_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'pnpm exec tsx server.ts',
      url: `${SERVER_URL}/health`,
      reuseExistingServer: false,
      timeout: START_TIMEOUT_MS,
    },
    {
      // The production build, so the page runs under its real Content-Security-Policy.
      command: `pnpm --filter @omi/web exec vite build --outDir dist-e2e && pnpm --filter @omi/web exec vite preview --outDir dist-e2e --port ${WEB_PORT} --strictPort`,
      url: WEB_URL,
      env: { VITE_SERVER_URL: SERVER_URL },
      reuseExistingServer: false,
      timeout: START_TIMEOUT_MS,
    },
  ],
});
