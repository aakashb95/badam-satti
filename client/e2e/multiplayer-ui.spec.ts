import { expect, type Browser, type BrowserContextOptions, type Page, test } from '@playwright/test';

const PLAYERS = ['Host', 'North', 'East', 'West'];

async function applyZoom(page: Page, zoom: number) {
  if (zoom === 1) return;
  const session = await page.context().newCDPSession(page);
  await session.send('Emulation.setPageScaleFactor', { pageScaleFactor: zoom });
}

async function login(page: Page, name: string) {
  await page.goto('/');
  await expect(page.locator('#player-name')).toBeVisible();
  await expectThemeToggleVisible(page);
  await page.locator('#player-name').fill(name);
  await page.locator('button.icon-submit').click();
  await expect(page.locator('.lobby-screen')).toBeVisible();
}

async function createRoom(page: Page) {
  await page.getByRole('button', { name: /Create a room/ }).click();
  await expect(page.locator('.waiting-screen')).toBeVisible();
  const roomCode = await page.locator('.invite-copy strong').innerText();
  expect(roomCode).toMatch(/^[A-Z0-9]{6}$/);
  return roomCode;
}

async function joinRoom(page: Page, roomCode: string, name: string) {
  await page.goto(`/r/${roomCode}`);
  await expect(page.locator('#username')).toBeVisible();
  await expectThemeToggleVisible(page);
  await page.locator('#username').fill(name);
  await page.getByRole('button', { name: /Join room/ }).click();
  await expect(page.locator('.waiting-screen')).toBeVisible();
}

async function expectThemeToggleVisible(page: Page) {
  const metrics = await page.locator('.theme-toggle').evaluate((element) => {
    const buttonRect = element.getBoundingClientRect();
    const iconRect = element.querySelector('.theme-toggle-icon svg')?.getBoundingClientRect();
    const style = getComputedStyle(element);
    return {
      buttonWidth: buttonRect.width,
      buttonHeight: buttonRect.height,
      iconWidth: iconRect?.width || 0,
      iconHeight: iconRect?.height || 0,
      color: style.color,
      backgroundColor: style.backgroundColor,
      borderColor: style.borderColor,
      visible:
        buttonRect.width > 0 &&
        buttonRect.height > 0 &&
        style.display !== 'none' &&
        style.visibility !== 'hidden',
    };
  });

  expect(metrics.visible).toBe(true);
  expect(metrics.buttonWidth).toBeGreaterThanOrEqual(32);
  expect(metrics.buttonHeight).toBeGreaterThanOrEqual(32);
  expect(metrics.iconWidth).toBeGreaterThanOrEqual(15);
  expect(metrics.iconHeight).toBeGreaterThanOrEqual(15);
  expect(metrics.borderColor).not.toBe('rgba(0, 0, 0, 0)');
}

async function expectGameLayoutStable(page: Page, label: string) {
  const result = await page.evaluate((label) => {
    const rectOf = (selector: string) => {
      const element = document.querySelector(selector);
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return {
        selector,
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        visible:
          rect.width > 0 &&
          rect.height > 0 &&
          style.display !== 'none' &&
          style.visibility !== 'hidden',
      };
    };

    const intersects = (a: ReturnType<typeof rectOf>, b: ReturnType<typeof rectOf>) =>
      Boolean(a && b && a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y);

    const rects = {
      theme: rectOf('.theme-toggle'),
      top: rectOf('.game-top-bar'),
      players: rectOf('.table-players'),
      board: rectOf('.game-board'),
      hand: rectOf('.hand-dock'),
    };

    const viewport = {
      width: window.innerWidth,
      height: window.innerHeight,
      scrollWidth: document.documentElement.scrollWidth,
      scrollHeight: document.documentElement.scrollHeight,
    };

    const offscreen = Object.values(rects)
      .filter(Boolean)
      .filter((rect) => rect!.x < -1 || rect!.y < -1 || rect!.x + rect!.width > viewport.width + 1 || rect!.y + rect!.height > viewport.height + 1)
      .map((rect) => rect!.selector);

    return {
      label,
      viewport,
      rects,
      checks: {
        keyPiecesVisible: Object.values(rects).every((rect) => rect?.visible),
        noHorizontalOverflow: viewport.scrollWidth <= viewport.width + 1,
        noTopPlayersOverlap: !intersects(rects.top, rects.players),
        noBoardHandOverlap: !intersects(rects.board, rects.hand),
        offscreen,
      },
    };
  }, label);

  expect(result.checks.keyPiecesVisible, `${label}: key game pieces should be visible`).toBe(true);
  expect(result.checks.noHorizontalOverflow, `${label}: no horizontal overflow`).toBe(true);
  expect(result.checks.noTopPlayersOverlap, `${label}: top bar should not overlap players`).toBe(true);
  expect(result.checks.noBoardHandOverlap, `${label}: board should not overlap hand`).toBe(true);
  expect(result.checks.offscreen, `${label}: key pieces should stay onscreen`).toEqual([]);
}

async function newPlayerPage(browser: Browser, options: BrowserContextOptions, baseURL: string) {
  const context = await browser.newContext({
    ...options,
    baseURL,
    serviceWorkers: 'block',
  });
  const page = await context.newPage();
  return { context, page };
}

test('four-player game renders and starts across responsive viewports', async ({ browser, page, baseURL }, testInfo) => {
  const projectUse = testInfo.project.use as BrowserContextOptions;
  const zoom = testInfo.project.name.includes('125-zoom') ? 1.25 : 1;
  const contextOptions: BrowserContextOptions = {
    viewport: page.viewportSize() || projectUse.viewport || { width: 1280, height: 720 },
    deviceScaleFactor: projectUse.deviceScaleFactor,
    isMobile: projectUse.isMobile,
    hasTouch: projectUse.hasTouch,
  };

  await login(page, PLAYERS[0]);

  const beforeTheme = await page.locator('.app').getAttribute('data-theme');
  await page.locator('.theme-toggle').click();
  await expect(page.locator('.app')).not.toHaveAttribute('data-theme', beforeTheme || '');
  await expectThemeToggleVisible(page);

  const roomCode = await createRoom(page);
  const extraPlayers = [];
  for (const name of PLAYERS.slice(1)) {
    const player = await newPlayerPage(browser, contextOptions, baseURL || '');
    extraPlayers.push(player);
    await joinRoom(player.page, roomCode, name);
  }

  await expect(page.locator('.player-item')).toHaveCount(PLAYERS.length);
  await page.locator('.start-button').click();

  const pages = [page, ...extraPlayers.map((player) => player.page)];
  for (const [index, playerPage] of pages.entries()) {
    await expect(playerPage.locator('.game-screen')).toBeVisible();
    await applyZoom(playerPage, zoom);
    await expectThemeToggleVisible(playerPage);
    await expectGameLayoutStable(playerPage, `${testInfo.project.name}:player-${index + 1}`);
  }

  await Promise.all(extraPlayers.map((player) => player.context.close()));
});
