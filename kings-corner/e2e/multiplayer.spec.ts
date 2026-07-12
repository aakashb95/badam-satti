import { expect, test } from '@playwright/test';

test('two players create, join, and begin a game', async ({ browser }) => {
  test.setTimeout(45_000);
  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext();
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();

  await host.goto('/kings-corner/');
  await host.getByPlaceholder('Enter your name').fill('Aakash');
  await host.getByRole('button', { name: 'Continue' }).click();
  await host.getByRole('button', { name: /Host a new table/ }).click();
  await expect(host.locator('.waiting-screen h1')).toBeVisible();
  const roomCode = await host.locator('.invite-copy strong').innerText();

  await guest.goto('/kings-corner/');
  await guest.getByPlaceholder('Enter your name').fill('Maya');
  await guest.getByRole('button', { name: 'Continue' }).click();
  await guest.getByLabel('Room code').fill(roomCode);
  await guest.getByRole('button', { name: 'Join table' }).click();
  await expect(guest.locator('.waiting-screen h1')).toBeVisible();
  await expect(host.getByText('Maya')).toBeVisible();

  await host.getByRole('button', { name: 'Start game' }).click();
  await expect(host.getByRole('heading', { name: 'King’s Corner' })).toBeVisible();
  await expect(guest.getByRole('heading', { name: 'King’s Corner' })).toBeVisible();
  await expect(host.getByText('Your hand')).toBeVisible();
  await expect(guest.getByText('Your hand')).toBeVisible();

  // The server, rather than either browser, must take one action after the inactivity window.
  await expect(host.getByText('Automatic move')).toBeVisible({ timeout: 22_000 });

  await guest.getByRole('link', { name: 'Game Desk — choose a game' }).click();
  await expect(guest).toHaveURL(/\/$/);
  await expect(host.getByRole('heading', { name: 'Aakash rules the table.' })).toBeVisible();
  await expect(host.getByText('Maya')).toHaveCount(0);

  await hostContext.close();
  await guestContext.close();
});

test('phone menu and animated help stay inside a narrow viewport', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 393, height: 852 } });
  const page = await context.newPage();
  await page.goto('/kings-corner/');
  await page.getByPlaceholder('Enter your name').fill('Phone Player');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByText('King’s Corner table')).toBeVisible();
  const greeting = (await page.locator('.menu-hero h1').innerText()).replace(/\s+/g, ' ').trim();
  expect([
    'Welcome, Phone Player.',
    'Ready, Phone Player?',
    'Table’s open, Phone Player.',
    'All set, Phone Player?',
  ]).toContain(greeting);

  const layout = await page.evaluate(() => {
    const codeEntry = document.querySelector('.code-entry')?.getBoundingClientRect();
    return {
      viewportWidth: window.innerWidth,
      bodyWidth: document.body.scrollWidth,
      codeLeft: codeEntry?.left || 0,
      codeRight: codeEntry?.right || 0,
    };
  });
  expect(layout.bodyWidth).toBeLessThanOrEqual(layout.viewportWidth);
  expect(layout.codeLeft).toBeGreaterThanOrEqual(0);
  expect(layout.codeRight).toBeLessThanOrEqual(layout.viewportWidth);

  await page.getByRole('button', { name: 'How to play' }).click();
  await expect(page.getByRole('dialog', { name: 'How to play' })).toBeVisible();
  await expect(page.getByText('Move complete piles')).toBeVisible();
  await page.getByRole('button', { name: 'A++' }).click();
  await page.getByRole('button', { name: 'Okay, let’s play' }).click();
  await expect(page.getByRole('dialog', { name: 'How to play' })).not.toBeVisible();
  const largeTextLayout = await page.evaluate(() => ({ viewportWidth: window.innerWidth, bodyWidth: document.body.scrollWidth, comfortSize: document.documentElement.dataset.comfortSize }));
  expect(largeTextLayout.comfortSize).toBe('extra-large');
  expect(largeTextLayout.bodyWidth).toBeLessThanOrEqual(largeTextLayout.viewportWidth);
  await context.close();
});

test('Game Desk identity remains usable at 320px with large comfort text', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 320, height: 568 }, hasTouch: true });
  const page = await context.newPage();
  await page.goto('/kings-corner/');
  await page.getByPlaceholder('Enter your name').fill('Small Phone');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'How to play' }).click();
  await page.getByRole('button', { name: 'A++' }).click();
  await page.getByRole('button', { name: 'Okay, let’s play' }).click();

  const layout = await page.evaluate(() => {
    const link = document.querySelector('.game-desk-link')?.getBoundingClientRect();
    return { bodyWidth: document.body.scrollWidth, viewportWidth: innerWidth, linkWidth: link?.width || 0, linkHeight: link?.height || 0 };
  });
  expect(layout.bodyWidth).toBeLessThanOrEqual(layout.viewportWidth);
  expect(layout.linkWidth).toBeGreaterThanOrEqual(44);
  expect(layout.linkHeight).toBeGreaterThanOrEqual(44);
  await context.close();
});

test('phone landscape gameplay fits while card images load slowly', async ({ browser }) => {
  const hostContext = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true });
  const guestContext = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true });
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();

  await host.route('**/images/cards/**', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1_500));
    await route.continue();
  });
  await host.goto('/kings-corner/');
  await host.getByPlaceholder('Enter your name').fill('Landscape Host');
  await host.getByRole('button', { name: 'Continue' }).click();
  await host.getByRole('button', { name: /Host a new table/ }).click();
  await expect(host.locator('.waiting-screen h1')).toBeVisible();
  const roomCode = await host.locator('.invite-copy strong').innerText();

  await guest.goto('/kings-corner/');
  await guest.getByPlaceholder('Enter your name').fill('Landscape Guest');
  await guest.getByRole('button', { name: 'Continue' }).click();
  await guest.getByLabel('Room code').fill(roomCode);
  await guest.getByRole('button', { name: 'Join table' }).click();
  await expect(host.getByText('Landscape Guest')).toBeVisible();
  await host.getByRole('button', { name: 'Start game' }).click();
  await expect(host.getByText('Your hand')).toBeVisible();
  await expect(host.locator('.card-fallback').first()).toBeVisible();

  const layout = await host.evaluate(() => {
    const board = document.querySelector('.tableau')?.getBoundingClientRect();
    const hand = document.querySelector('.hand-area')?.getBoundingClientRect();
    const desk = document.querySelector('.game-desk-link')?.getBoundingClientRect();
    const clock = document.querySelector('.turn-clock')?.getBoundingClientRect();
    return {
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      bodyWidth: document.body.scrollWidth,
      bodyHeight: document.body.scrollHeight,
      boardHeight: board?.height || 0,
      handBottom: hand?.bottom || 0,
      deskRight: desk?.right || 0,
      clockLeft: clock?.left || 0,
    };
  });
  expect(layout.bodyWidth).toBeLessThanOrEqual(layout.viewportWidth);
  expect(layout.bodyHeight).toBeLessThanOrEqual(layout.viewportHeight);
  expect(layout.boardHeight).toBeGreaterThan(150);
  expect(layout.handBottom).toBeLessThanOrEqual(layout.viewportHeight);
  expect(layout.deskRight).toBeLessThanOrEqual(layout.clockLeft);
  await hostContext.close();
  await guestContext.close();
});
