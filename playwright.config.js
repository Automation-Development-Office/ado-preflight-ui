const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: 'http://127.0.0.1:8080',
    trace: 'on-first-retry'
  },
  webServer: {
    command: 'node server.js',
    url: 'http://127.0.0.1:8080',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      ADO_PREFLIGHT_TERMINAL_ENABLED: 'false'
    }
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } }
  ]
});
