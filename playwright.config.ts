import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 45_000,
  reporter: [['line']],
  use: { browserName: 'chromium', headless: true, viewport: { width: 1280, height: 850 } }
});
