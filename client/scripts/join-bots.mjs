import { chromium } from '@playwright/test';

const baseUrl = process.env.BADAM_TEST_URL || 'http://127.0.0.1:3000';
const roomCode = process.argv[2];
const names = ['Maya', 'Raj', 'Dev', 'Asha', 'Neha'];
const browser = await chromium.launch({ headless: true });

for (const name of names) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    serviceWorkers: 'block',
  });
  const page = await context.newPage();
  await page.goto(`${baseUrl}/badam7/r/${roomCode}?timer=10`);
  await page.locator('#username').fill(name);
  await page.getByRole('button', { name: /Join room/ }).click();
  await page.locator('.waiting-screen').waitFor();
  console.log(`${name} joined`);
}

console.log('All bots joined. They will auto-play on their turns.');
await new Promise(() => {});
