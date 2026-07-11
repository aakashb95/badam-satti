import { defineConfig } from '@playwright/test';

const port = 3101;
const dbPath = '/tmp/badam-satti-ui-e2e.db';

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 6_000 },
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `npm run build && rm -f ${dbPath} && cd ../server && HOST=127.0.0.1 PORT=${port} DB_PATH=${dbPath} ADMIN_KEY=test-admin IP_HASH_SALT=test-salt NODE_ENV=test node index.js`,
    url: `http://127.0.0.1:${port}/health`,
    reuseExistingServer: false,
    timeout: 45_000,
  },
  projects: [
    {
      name: 'mobile-390',
      use: {
        browserName: 'chromium',
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 3,
      },
    },
    {
      name: 'small-phone-320',
      use: {
        browserName: 'chromium',
        viewport: { width: 320, height: 568 },
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 2,
      },
    },
    {
      name: 'phone-landscape-844',
      use: {
        browserName: 'chromium',
        viewport: { width: 844, height: 390 },
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 3,
      },
    },
    {
      name: 'desktop-125-zoom',
      use: {
        browserName: 'chromium',
        viewport: { width: 1280, height: 720 },
        deviceScaleFactor: 1,
      },
    },
  ],
});
