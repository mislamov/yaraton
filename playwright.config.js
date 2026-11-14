import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  reporter: 'list',
  use: { baseURL: process.env.TEST_URL || 'http://127.0.0.1:4173', browserName: 'chromium', channel: process.env.PLAYWRIGHT_CHANNEL || undefined, screenshot: 'only-on-failure' },
  webServer: process.env.TEST_URL ? undefined : { command: 'npm start', url: 'http://127.0.0.1:4173', reuseExistingServer: true },
});
