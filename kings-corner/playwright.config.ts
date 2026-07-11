import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  use: { baseURL: 'http://127.0.0.1:5101', headless: true },
  webServer: [
    // Never inherit an arbitrary developer process: it may be running an old
    // build or proxy configuration and produce misleading connection failures.
    { command: 'npm --prefix server start', port: 5100, reuseExistingServer: false },
    { command: 'npm --prefix client run dev', port: 5101, reuseExistingServer: false },
  ],
});
