import { expect, test } from '@playwright/test';

test('two players create, join, and begin a game', async ({ browser }) => {
  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext();
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();

  await host.goto('/');
  await host.getByLabel('Your name').fill('Aakash');
  await host.getByRole('button', { name: 'Create a new table' }).click();
  await expect(host.getByText('Private table')).toBeVisible();
  const heading = await host.locator('h1').innerText();
  const roomCode = heading.replace('Room', '').trim();

  await guest.goto('/');
  await guest.getByLabel('Your name').fill('Maya');
  await guest.getByLabel('Room code').fill(roomCode);
  await guest.getByRole('button', { name: 'Join' }).click();
  await expect(guest.getByText('Private table')).toBeVisible();
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
