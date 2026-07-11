import { expect, test } from '@playwright/test';

test('two players create, join, and begin a game', async ({ browser }) => {
  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext();
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();

  await host.goto('/');
  await host.getByPlaceholder('Enter your name').fill('Aakash');
  await host.getByRole('button', { name: 'Continue' }).click();
  await host.getByRole('button', { name: 'Create a table' }).click();
  await expect(host.locator('.waiting-screen h1')).toBeVisible();
  const roomCode = await host.locator('.invite-copy strong').innerText();

  await guest.goto('/');
  await guest.getByPlaceholder('Enter your name').fill('Maya');
  await guest.getByRole('button', { name: 'Continue' }).click();
  await guest.getByLabel('Room code').fill(roomCode);
  await guest.getByRole('button', { name: 'Join' }).click();
  await expect(guest.locator('.waiting-screen h1')).toBeVisible();
  await expect(host.getByText('Maya')).toBeVisible();

  await host.getByRole('button', { name: 'Start game' }).click();
  await expect(host.getByRole('heading', { name: 'King’s Corner' })).toBeVisible();
  await expect(guest.getByRole('heading', { name: 'King’s Corner' })).toBeVisible();
  await expect(host.getByText('Your hand')).toBeVisible();
  await expect(guest.getByText('Your hand')).toBeVisible();

  // The server, rather than either browser, must take one action after 10 seconds.
  await expect(host.getByText('Automatic move')).toBeVisible({ timeout: 12_000 });

  await hostContext.close();
  await guestContext.close();
});

test('phone menu and animated help stay inside a narrow viewport', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 393, height: 852 } });
  const page = await context.newPage();
  await page.goto('/');
  await page.getByPlaceholder('Enter your name').fill('Phone Player');
  await page.getByRole('button', { name: 'Continue' }).click();

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
  await page.getByRole('button', { name: 'Okay, let’s play' }).click();
  await expect(page.getByRole('dialog', { name: 'How to play' })).not.toBeVisible();
  await context.close();
});
