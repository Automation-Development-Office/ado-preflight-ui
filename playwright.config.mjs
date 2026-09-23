// @ts-check
import { defineConfig, devices } from '@playwright/test';

/**
 * Browser smoke/e2e for ado-preflight-ui.
 * Requires a built `dist/` (npm run build). Playwright starts `node server.js`.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: process.env.PREFLIGHT_BASE_URL || 'http://127.0.0.1:8080',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'off'
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    }
  ],
  webServer: process.env.PREFLIGHT_BASE_URL
    ? undefined
    : {
        command: 'node server.js',
        url: 'http://127.0.0.1:8080/',
        // Default off so local runs do not reuse a stale preflight pod/server on :8080.
        reuseExistingServer: process.env.PW_REUSE_SERVER === '1',
        timeout: 120_000
      }
});
