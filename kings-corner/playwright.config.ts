import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  use: { baseURL: 'http://127.0.0.1:5101', headless: true },
  webServer: [
    { command: 'npm --prefix server start', port: 5100, reuseExistingServer: true },
    { command: 'npm --prefix client run dev', port: 5101, reuseExistingServer: true },
  ],
});
