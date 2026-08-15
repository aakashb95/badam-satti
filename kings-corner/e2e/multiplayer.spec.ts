import { expect, test, type Page } from '@playwright/test';

test('two players create, join, and begin a game', async ({ browser }) => {
  test.setTimeout(45_000);
  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext();
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();

  await host.goto('/kings-corner/');
  await host.getByPlaceholder('Enter your name').fill('Aakash');
  await host.getByRole('button', { name: 'Continue' }).click();
  await host.getByRole('button', { name: /Host a new room/ }).click();
  await expect(host.getByRole('heading', { name: 'Waiting for players' })).toBeVisible();
  const roomCode = await host.locator('.invite-copy strong').innerText();

  await expect(host.locator('.invite-link')).toContainText(`/kings-corner/r/${roomCode}`);
  await guest.goto(`/kings-corner/r/${roomCode}`);
  await expect(guest.getByText(`You're invited to room ${roomCode}`)).toBeVisible();
  await guest.getByPlaceholder('Enter your name').fill('Maya');
  await guest.getByRole('button', { name: 'Join invited table' }).click();
  await expect(guest.getByRole('heading', { name: 'Waiting for players' })).toBeVisible();
  await expect(host.getByText('Maya')).toBeVisible();

  await host.getByRole('button', { name: 'Start game' }).click();
  await expect(host.locator('.game-brand')).toContainText("King's Corner");
  await expect(guest.locator('.game-brand')).toContainText("King's Corner");
  await expect(host.getByText('Your hand')).toBeVisible();
  await expect(guest.getByText('Your hand')).toBeVisible();
  await expect(host.locator('.game-starter-note')).toContainText('started this game');
  await expect(host.getByRole('button', { name: /Change text size/ })).toBeVisible();
  await expect(host.getByRole('button', { name: 'Leave room' })).toBeVisible();
  await host.getByRole('button', { name: 'Leave room' }).click();
  await expect(host.getByRole('dialog', { name: 'Leave this game?' })).toBeVisible();
  await host.getByRole('button', { name: 'Stay in game' }).click();
  await host.evaluate(() => window.history.back());
  await expect(host.getByRole('dialog', { name: 'Leave this game?' })).toBeVisible();
  await host.getByRole('button', { name: 'Stay in game' }).click();

  // The server, rather than either browser, must take one action after the inactivity window.
  await expect(host.getByText('Automatic move')).toBeVisible({ timeout: 22_000 });

  await guest.getByRole('link', { name: 'Main menu — choose a game' }).click();
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
  await page.getByRole('button', { name: /New to King's Corner/ }).click();
  await expect(page.getByRole('dialog', { name: 'How to play' })).toBeVisible();
  await page.getByRole('button', { name: 'Close help' }).click();
  await page.getByPlaceholder('Enter your name').fill('Phone Player');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByText('King’s Corner table')).toBeVisible();
  const greeting = (await page.locator('.menu-hero h2').innerText()).replace(/\s+/g, ' ').trim();
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

  await page.getByRole('button', { name: 'Sound settings' }).click();
  await expect(page.getByRole('checkbox', { name: 'Background music' })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: 'Game sounds' })).toBeVisible();
  await page.getByRole('button', { name: 'Sound settings' }).click();
  await page.getByRole('button', { name: 'How to play' }).click();
  await expect(page.getByRole('dialog', { name: 'How to play' })).toBeVisible();
  for (const title of ['Only Kings open a corner', 'Go down. Alternate colours.', 'Move a whole pile together', 'Play all you can, then finish', 'Follow the arrow or choose', 'Use Finish turn when you’re done']) {
    await page.getByRole('button', { name: 'Next' }).click();
    await expect(page.getByText(title)).toBeVisible();
  }
  await page.getByRole('button', { name: 'A+++', exact: true }).click();
  await page.getByRole('button', { name: /Got it/ }).click();
  await expect(page.getByRole('dialog', { name: 'How to play' })).not.toBeVisible();
  const largeTextLayout = await page.evaluate(() => ({ viewportWidth: window.innerWidth, bodyWidth: document.body.scrollWidth, comfortSize: document.documentElement.dataset.comfortSize }));
  expect(largeTextLayout.comfortSize).toBe('maximum');
  expect(largeTextLayout.bodyWidth).toBeLessThanOrEqual(largeTextLayout.viewportWidth);
  await context.close();
});

test('Main menu identity remains usable at 320px with large comfort text', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 320, height: 568 }, hasTouch: true });
  const page = await context.newPage();
  await page.goto('/kings-corner/');
  await page.getByPlaceholder('Enter your name').fill('Small Phone');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'How to play' }).click();
  for (let step = 0; step < 6; step += 1) await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'A++', exact: true }).click();
  await page.getByRole('button', { name: /Got it/ }).click();

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
  await host.getByRole('button', { name: /Host a new room/ }).click();
  await expect(host.getByRole('heading', { name: 'Waiting for players' })).toBeVisible();
  const roomCode = await host.locator('.invite-copy strong').innerText();

  await guest.goto('/kings-corner/');
  await guest.getByPlaceholder('Enter your name').fill('Landscape Guest');
  await guest.getByRole('button', { name: 'Continue' }).click();
  await guest.getByLabel('Room code').fill(roomCode);
  await guest.getByRole('button', { name: 'Join room' }).click();
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

test('gameplay parity holds across phone, tablet, and desktop sizes', async ({ browser }, testInfo) => {
  test.setTimeout(45_000);
  const sizes = [
    { label: 'small-phone', width: 320, height: 568 },
    { label: 'current-phone', width: 393, height: 852 },
    { label: 'tablet', width: 768, height: 1024 },
    { label: 'desktop', width: 1440, height: 900 },
  ];
  const contexts = await Promise.all(sizes.map(({ width, height }) => browser.newContext({ viewport: { width, height }, hasTouch: width < 900 })));
  const pages = await Promise.all(contexts.map((context) => context.newPage()));

  for (const [index, page] of pages.entries()) {
    await page.goto('/kings-corner/');
    await page.getByPlaceholder('Enter your name').fill(`Parity ${index + 1}`);
    await page.getByRole('button', { name: 'Continue' }).click();
  }

  await pages[1].screenshot({ path: testInfo.outputPath('current-phone-lobby.png'), fullPage: true });
  await pages[3].screenshot({ path: testInfo.outputPath('desktop-lobby.png'), fullPage: true });

  await pages[0].getByRole('button', { name: /Host a new room/ }).click();
  const roomCode = await pages[0].locator('.invite-copy strong').innerText();
  for (const page of pages.slice(1)) {
    await page.getByLabel('Room code').fill(roomCode);
    await page.getByRole('button', { name: 'Join room' }).click();
  }
  await expect(pages[0].getByText('Parity 4')).toBeVisible();
  await pages[1].screenshot({ path: testInfo.outputPath('current-phone-waiting.png'), fullPage: true });
  await pages[2].screenshot({ path: testInfo.outputPath('tablet-waiting.png'), fullPage: true });
  await pages[0].getByRole('button', { name: 'Start game' }).click();
  await Promise.all(pages.map((page) => expect(page.getByText('Your hand')).toBeVisible()));

  for (let index = 0; index < 3; index += 1) await pages[2].getByRole('button', { name: /Change text size/ }).click();

  for (const [index, page] of pages.entries()) {
    const layout = await page.evaluate(() => {
      const box = (selector: string) => {
        const rect = document.querySelector(selector)?.getBoundingClientRect();
        return rect ? { top: rect.top, right: rect.right, bottom: rect.bottom, left: rect.left, width: rect.width, height: rect.height } : null;
      };
      const cards = Array.from(document.querySelectorAll<HTMLElement>('.hand-cards .playing-card')).map((card) => {
        const rect = card.getBoundingClientRect();
        return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
      });
      return {
        viewport: { width: innerWidth, height: innerHeight },
        scrollWidth: document.documentElement.scrollWidth,
        header: box('.game-top-bar'),
        players: box('.players-strip'),
        board: box('.tableau'),
        hand: box('.hand-area'),
        cards,
      };
    });
    expect(layout.scrollWidth, `${sizes[index].label} should not scroll sideways`).toBeLessThanOrEqual(layout.viewport.width + 1);
    expect(layout.header?.left, `${sizes[index].label} header starts onscreen`).toBeGreaterThanOrEqual(-1);
    expect(layout.header?.right, `${sizes[index].label} header ends onscreen. ${JSON.stringify(layout)}`).toBeLessThanOrEqual(layout.viewport.width + 1);
    expect(layout.board?.width, `${sizes[index].label} board remains visible`).toBeGreaterThan(180);
    expect(layout.hand?.width, `${sizes[index].label} hand remains visible`).toBeGreaterThan(180);
    expect(layout.cards.length, `${sizes[index].label} shows every hand card`).toBeGreaterThan(0);
    expect(layout.cards.every((card) => card.left >= -1 && card.right <= layout.viewport.width + 1), `${sizes[index].label} keeps cards reachable`).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`${sizes[index].label}.png`), fullPage: true });
  }

  let selectedPage: Page | null = null;
  for (let turn = 0; turn < 12 && !selectedPage; turn += 1) {
    for (const page of pages) {
      if (await page.locator('.turn-status.is-active').count()) {
        if (await page.locator('.hand-cards .playing-card.playable').count()) {
          selectedPage = page;
          break;
        }
        await page.getByRole('button', { name: /Finish turn/ }).click();
        await page.waitForTimeout(80);
        break;
      }
    }
  }

  expect(selectedPage, 'at least one turn should offer a playable hand card').not.toBeNull();
  if (selectedPage) {
    const playable = selectedPage.locator('.hand-cards .playing-card.playable').first();
    const playableStyle = await playable.evaluate((card) => ({
      lift: new DOMMatrixReadOnly(getComputedStyle(card).transform).m42,
      outline: getComputedStyle(card, '::after').borderTopWidth,
    }));
    expect(playableStyle.lift).toBeLessThanOrEqual(-6);
    expect(playableStyle.outline).toBe('2px');
    await playable.click();
    await expect(playable).toHaveClass(/is-selected/);
    const playButton = selectedPage.locator('.play-card-button');
    if (await playButton.isDisabled()) await selectedPage.locator('.pile-card-target .pile-hitbox').first().click();
    await expect(playButton).toBeEnabled();
    await selectedPage.screenshot({ path: testInfo.outputPath('selected-card.png'), fullPage: true });
  }

  await Promise.all(contexts.map((context) => context.close()));
});
