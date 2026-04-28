import { defineConfig } from '@playwright/test';
import path from 'path';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,       // Electron startup + diagram rendering can be slow
  retries: 0,
  workers: 1,            // Electron tests must run serially (single app window)
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ],
  use: {
    screenshot: 'only-on-failure',
    video:      'on-first-retry',
    trace:      'on-first-retry',
  },
  snapshotDir: './tests/e2e/snapshots',
  snapshotPathTemplate: '{snapshotDir}/{testFilePath}/{arg}{ext}',
});
