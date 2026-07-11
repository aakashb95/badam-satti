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
  await expect(host.locator('.waiting h1')).toBeVisible();
  const heading = await host.locator('.waiting h1').innerText();
  const roomCode = heading.replace('Room', '').trim();

  await guest.goto('/');
  await guest.getByPlaceholder('Enter your name').fill('Maya');
  await guest.getByRole('button', { name: 'Continue' }).click();
  await guest.getByLabel('Room code').fill(roomCode);
  await guest.getByRole('button', { name: 'Join' }).click();
  await expect(guest.locator('.waiting h1')).toBeVisible();
  await expect(host.getByText('Maya')).toBeVisible();

  await host.getByRole('button', { name: 'Deal the cards' }).click();
  await expect(host.getByRole('heading', { name: 'King’s Corner' })).toBeVisible();
  await expect(guest.getByRole('heading', { name: 'King’s Corner' })).toBeVisible();
  await expect(host.getByText('Your hand')).toBeVisible();
  await expect(guest.getByText('Your hand')).toBeVisible();

  // The server, rather than either browser, must take one action after 10 seconds.
  await expect(host.getByText('Automatic move')).toBeVisible({ timeout: 12_000 });

  await hostContext.close();
  await guestContext.close();
});
