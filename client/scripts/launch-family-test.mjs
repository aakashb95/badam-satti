import { chromium } from '@playwright/test';

const baseUrl = process.env.BADAM_TEST_URL || 'http://127.0.0.1:3000';
const names = ['Aakash', 'Maya', 'Raj', 'Dev', 'Asha', 'Neha'];
const browser = await chromium.launch({ headless: false });
const sessions = [];

async function newSession(name) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    serviceWorkers: 'block',
  });
  const page = await context.newPage();
  sessions.push({ name, context, page });
  return page;
}

try {
  const host = await newSession(names[0]);
  await host.goto(`${baseUrl}/badam7/`);
  await host.locator('#player-name').fill(names[0]);
  await host.locator('button.icon-submit').click();
  await host.locator('.lobby-screen').waitFor();
  await host.getByRole('button', { name: /Host a new room/ }).click();
  const roomCode = await host.locator('.invite-copy strong').innerText();

  for (const name of names.slice(1)) {
    const page = await newSession(name);
    await page.goto(`${baseUrl}/badam7/r/${roomCode}`);
    await page.locator('#username').fill(name);
    await page.getByRole('button', { name: /Join room/ }).click();
    await page.locator('.waiting-screen').waitFor();
  }

  await host.locator('.player-item').nth(names.length - 1).waitFor();
  await host.locator('.start-button').click();
  await host.locator('.game-screen').waitFor();
  await host.bringToFront();

  console.log(`Six-player test game ${roomCode} is open at ${baseUrl}/badam7/`);
  console.log('Close the browser or press Ctrl+C here when you are done.');
  await new Promise((resolve) => {
    process.once('SIGINT', resolve);
    process.once('SIGTERM', resolve);
    browser.once('disconnected', resolve);
  });
} finally {
  await Promise.all(sessions.map(({ context }) => context.close().catch(() => {})));
  await browser.close().catch(() => {});
}
