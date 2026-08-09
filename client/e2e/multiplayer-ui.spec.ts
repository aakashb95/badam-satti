import { expect, type Browser, type BrowserContextOptions, type Page, test } from '@playwright/test';

const PLAYERS = ['Host', 'North', 'East', 'South', 'West', 'Guest', 'Corner'];
const FIVE_PLAYERS = PLAYERS.slice(0, 5);

async function applyZoom(page: Page, zoom: number) {
  if (zoom === 1) return;
  const session = await page.context().newCDPSession(page);
  await session.send('Emulation.setPageScaleFactor', { pageScaleFactor: zoom });
}

async function login(page: Page, name: string) {
  await page.goto('/badam7/');
  await expect(page.locator('#player-name')).toBeVisible();
  await expectNoThemeToggle(page);
  await page.locator('#player-name').fill(name);
  await page.locator('button.icon-submit').click();
  await expect(page.locator('.lobby-screen')).toBeVisible();
  await expect(page.getByText('Badam 7 table')).toBeVisible();
  const greeting = (await page.locator('.menu-hero h2').innerText()).replace(/\s+/g, ' ').trim();
  expect([
    `Welcome, ${name}.`,
    `Ready, ${name}?`,
    `Table’s open, ${name}.`,
    `All set, ${name}?`,
  ]).toContain(greeting);
  await expectNoThemeToggle(page);
}

async function createRoom(page: Page) {
  await page.getByRole('button', { name: /Host a new room/ }).click();
  await expect(page.locator('.waiting-screen')).toBeVisible();
  const roomCode = await page.locator('.invite-copy strong').innerText();
  expect(roomCode).toMatch(/^[A-Z0-9]{6}$/);
  return roomCode;
}

async function joinRoom(page: Page, roomCode: string, name: string) {
  await page.goto(`/badam7/r/${roomCode}`);
  await expect(page.locator('#username')).toBeVisible();
  await expectNoThemeToggle(page);
  await page.locator('#username').fill(name);
  await page.getByRole('button', { name: /Join room/ }).click();
  await expect(page.locator('.waiting-screen')).toBeVisible();
  await expectNoThemeToggle(page);
}

async function expectNoThemeToggle(page: Page) {
  await expect(page.locator('.theme-toggle')).toHaveCount(0);
  await expect(page.locator('.app')).not.toHaveAttribute('data-theme', /.+/);
}

async function expectWaitingToolbar(page: Page) {
  const toolbar = page.locator('.waiting-toolbar');
  const controls = toolbar.locator('.round-icon-button');
  await expect(toolbar).toBeVisible();
  await expect(controls).toHaveCount(3);
  await expect(page.getByRole('button', { name: 'How to play' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Leave room' })).toBeVisible();
  expect(await toolbar.evaluate((toolbarElement) => {
    const elements = Array.from(toolbarElement.querySelectorAll<HTMLElement>('.round-icon-button'));
    return elements.every((element) => {
      const rect = element.getBoundingClientRect();
      return rect.width >= 44 && rect.height >= 44;
    });
  })).toBe(true);
}

async function expectGameLayoutStable(page: Page, label: string) {
  const result = await page.evaluate((label) => {
    const rectForElement = (element: Element | null, selector: string) => {
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
    const rectOf = (selector: string) => rectForElement(document.querySelector(selector), selector);

    const intersects = (a: ReturnType<typeof rectOf>, b: ReturnType<typeof rectOf>) =>
      Boolean(a && b && a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y);

    const rects = {
      top: rectOf('.game-top-bar'),
      desk: rectOf('.game-desk-link'),
      stage: rectOf('.table-stage'),
      players: rectOf('.table-players'),
      moveNotice: rectOf('.player-move-notice'),
      board: rectOf('.game-board'),
      hand: rectOf('.hand-dock'),
    };
    const playerElements = Array.from(document.querySelectorAll<HTMLElement>('.table-player'));
    const playerPills = playerElements
      .map((element, index) => rectForElement(element, `.table-player:nth-${index + 1}`))
      .filter(Boolean);
    const boardPieces = Array.from(document.querySelectorAll('.board-card-img, .empty-pile'))
      .map((element, index) => rectForElement(element, `.board-piece:nth-${index + 1}`))
      .filter(Boolean);
    const clockPositions = playerElements.map((element) => Number(element.dataset.clockPosition));
    const expectedClockPositions = playerElements.map((_, index) =>
      Number(((index * 12) / Math.max(playerElements.length, 1)).toFixed(3)),
    );
    const overlappingPlayers = playerPills.flatMap((player, index) =>
      playerPills.slice(index + 1)
        .filter((otherPlayer) => intersects(player, otherPlayer))
        .map((otherPlayer) => `${player?.selector}:${otherPlayer?.selector}`),
    );
    const firstPlayer = playerPills[0];
    const secondPlayer = playerPills[1];
    const stageCenter = rects.stage
      ? { x: rects.stage.x + rects.stage.width / 2, y: rects.stage.y + rects.stage.height / 2 }
      : null;

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
      playerPills,
      checks: {
        keyPiecesVisible: Object.values(rects).every((rect) => rect?.visible),
        noHorizontalOverflow: viewport.scrollWidth <= viewport.width + 1,
        noTopPlayersOverlap: !intersects(rects.top, rects.players),
        moveNoticeAnchoredClear: playerPills.every((player) => !intersects(rects.moveNotice, player)),
        noBoardPlayerOverlap: playerPills.every((player) => boardPieces.every((boardPiece) => !intersects(boardPiece, player))),
        overlappingPlayers,
        selfAnchoredAtSix: Boolean(
          firstPlayer &&
          stageCenter &&
          Math.abs(firstPlayer.x + firstPlayer.width / 2 - stageCenter.x) <= 2 &&
          firstPlayer.y + firstPlayer.height / 2 > stageCenter.y,
        ),
        clockwiseSeatOrder: Boolean(
          !secondPlayer ||
          !stageCenter ||
          secondPlayer.x + secondPlayer.width / 2 < stageCenter.x,
        ),
        clockPositions,
        expectedClockPositions,
        deskHasTouchTarget: Boolean(rects.desk && rects.desk.width >= 44 && rects.desk.height >= 38),
        noBoardHandOverlap: !intersects(rects.board, rects.hand),
        offscreen,
      },
    };
  }, label);

  expect(result.checks.keyPiecesVisible, `${label}: key game pieces should be visible`).toBe(true);
  expect(result.checks.noHorizontalOverflow, `${label}: no horizontal overflow`).toBe(true);
  expect(result.checks.noTopPlayersOverlap, `${label}: top bar should not overlap players`).toBe(true);
  expect(result.checks.moveNoticeAnchoredClear, `${label}: the latest move should sit above its player pill. ${JSON.stringify(result)}`).toBe(true);
  expect(result.checks.noBoardPlayerOverlap, `${label}: board should stay inside the clock of players. ${JSON.stringify(result)}`).toBe(true);
  expect(result.checks.overlappingPlayers, `${label}: player pills should not overlap. ${JSON.stringify(result)}`).toEqual([]);
  expect(result.checks.selfAnchoredAtSix, `${label}: the local player should remain at six o'clock`).toBe(true);
  expect(result.checks.clockwiseSeatOrder, `${label}: player order should move clockwise from six o'clock`).toBe(true);
  expect(result.checks.clockPositions, `${label}: players should evenly divide the twelve-position clock`).toEqual(result.checks.expectedClockPositions);
  expect(result.checks.deskHasTouchTarget, `${label}: Game Desk should retain a usable touch target`).toBe(true);
  expect(result.checks.noBoardHandOverlap, `${label}: board should not overlap hand`).toBe(true);
  expect(result.checks.offscreen, `${label}: key pieces should stay onscreen. ${JSON.stringify(result)}`).toEqual([]);
}

async function expectFourSectionHandStable(page: Page, label: string, phonePortrait: boolean) {
  await page.waitForTimeout(220);
  const result = await page.evaluate(() => {
    const dock = document.querySelector('.hand-dock')?.getBoundingClientRect();
    const pass = document.querySelector('.hand-pass-button')?.getBoundingClientRect();
    const sections = Array.from(document.querySelectorAll<HTMLElement>('.hand-suit'));
    const cards = Array.from(document.querySelectorAll<HTMLElement>('.hand-card'));
    const suitOrder = ['hearts', 'diamonds', 'clubs', 'spades'];
    const sectionMeasurements = sections.map((section) => {
      const sectionRect = section.getBoundingClientRect();
      const sectionCards = Array.from(section.querySelectorAll<HTMLElement>('.hand-card'));
      const rects = sectionCards.map((card) => card.getBoundingClientRect());
      return {
        suit: section.dataset.suit || '',
        x: sectionRect.x,
        y: sectionRect.y,
        cardCount: sectionCards.length,
        steps: rects.slice(1).map((rect, index) => rect.x - rects[index].x),
      };
    });
    const cardOrder = cards.map((card) => ({
      suit: card.dataset.suit || '',
      rank: Number(card.dataset.rank),
    }));
    const sortedCardOrder = [...cardOrder].sort((first, second) => {
      const suitDifference = suitOrder.indexOf(first.suit) - suitOrder.indexOf(second.suit);
      return suitDifference || first.rank - second.rank;
    });
    const playableCards = cards.filter((card) => card.classList.contains('playable'));

    return {
      dock: dock ? { left: dock.left, right: dock.right, top: dock.top, bottom: dock.bottom } : null,
      pass: pass ? { left: pass.left, right: pass.right, top: pass.top, bottom: pass.bottom, width: pass.width, height: pass.height } : null,
      sectionCount: sections.length,
      sectionMeasurements,
      cardOrder,
      sortedCardOrder,
      suits: Object.fromEntries(suitOrder.map((suit) => [suit, cards.filter((card) => card.dataset.suit === suit).length])),
      playableCount: playableCards.length,
      playableLift: playableCards.map((card) => new DOMMatrixReadOnly(getComputedStyle(card).transform).m42),
      cardBounds: cards.map((card) => {
        const rect = card.getBoundingClientRect();
        return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
      }),
    };
  });

  expect(result.sectionCount, `${label}: one hand section per suit`).toBe(4);
  expect(result.cardOrder, `${label}: cards remain ordered by suit and rank`).toEqual(result.sortedCardOrder);
  expect(result.suits.hearts, `${label}: Hearts should be visible`).toBeGreaterThan(0);
  expect(result.suits.diamonds, `${label}: Diamonds should be visible`).toBeGreaterThan(0);
  expect(result.suits.clubs, `${label}: Clubs should be visible`).toBeGreaterThan(0);
  expect(result.suits.spades, `${label}: Spades should be visible`).toBeGreaterThan(0);
  expect(result.playableCount, `${label}: playable cards across all four suits should lift`).toBe(8);
  expect(result.playableLift.every((lift) => lift <= -6), `${label}: every playable card should be visibly raised`).toBe(true);
  expect(
    result.sectionMeasurements.every((section) => section.steps.every((step) => step >= 12)),
    `${label}: each card corner needs enough reveal inside its suit. ${JSON.stringify(result)}`,
  ).toBe(true);
  expect(result.pass && Math.abs(result.pass.width - result.pass.height) <= 1, `${label}: Pass should be circular`).toBe(true);
  expect(result.pass && result.pass.width >= 48, `${label}: Pass should retain a thumb-sized target`).toBe(true);
  expect(
    result.dock && result.pass && Math.abs((result.pass.left + result.pass.right) / 2 - (result.dock.left + result.dock.right) / 2) <= 2,
    `${label}: Pass should stay centered between the four suit sections`,
  ).toBe(true);
  const sectionBySuit = Object.fromEntries(result.sectionMeasurements.map((section) => [section.suit, section]));
  if (phonePortrait) {
    expect(Math.abs(sectionBySuit.hearts.y - sectionBySuit.diamonds.y), `${label}: red suits share the top row`).toBeLessThanOrEqual(2);
    expect(Math.abs(sectionBySuit.clubs.y - sectionBySuit.spades.y), `${label}: black suits share the bottom row`).toBeLessThanOrEqual(2);
    expect(sectionBySuit.clubs.y, `${label}: black suits sit below red suits`).toBeGreaterThan(sectionBySuit.hearts.y);
  } else {
    const sectionYs = result.sectionMeasurements.map((section) => section.y);
    expect(Math.max(...sectionYs) - Math.min(...sectionYs), `${label}: four suits share one row`).toBeLessThanOrEqual(2);
  }
  expect(
    result.dock && result.cardBounds.every((card) =>
      card.left >= result.dock!.left - 1 &&
      card.right <= result.dock!.right + 1 &&
      card.top >= result.dock!.top - 1 &&
      card.bottom <= result.dock!.bottom + 1),
    `${label}: every card should remain inside the hand dock. ${JSON.stringify(result)}`,
  ).toBe(true);
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

test('first-time guide completes the rules and table walkthrough on a phone', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 393, height: 852 }, hasTouch: true, serviceWorkers: 'block' });
  const page = await context.newPage();
  await page.goto('/badam7/');
  await page.getByRole('button', { name: /New to Badam 7/ }).click();
  const dialog = page.getByRole('dialog', { name: 'How to play' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('Every card is dealt')).toBeVisible();

  const expectedSteps = [
    'The 7♥ starts the table',
    'Three kinds of move can open',
    'Only the next card fits',
    'Get out first for zero points',
    'Lowest total wins seven rounds',
    'Choose, then play',
  ];
  for (const title of expectedSteps) {
    await dialog.getByRole('button', { name: 'Next' }).click();
    await expect(dialog.getByText(title)).toBeVisible();
  }

  await expect(dialog.getByText('Using the table', { exact: true })).toHaveClass(/active/);
  await dialog.getByRole('button', { name: 'A+++' }).click();
  await dialog.getByRole('button', { name: /Got it/ }).click();
  await expect(dialog).not.toBeVisible();
  expect(await page.evaluate(() => document.documentElement.dataset.comfortSize)).toBe('maximum');
  expect(await page.evaluate(() => document.body.scrollWidth <= window.innerWidth)).toBe(true);
  await context.close();
});

test('sound settings keep music and game sounds separate from the waiting room into the game', async ({ browser, page, baseURL }) => {
  await login(page, 'Music Host');
  const roomCode = await createRoom(page);

  await page.getByRole('button', { name: 'Sound settings' }).click();
  const soundMenu = page.getByRole('group', { name: 'Sound settings' });
  const backgroundMusic = soundMenu.getByRole('checkbox', { name: 'Background music' });
  const gameSounds = soundMenu.getByRole('checkbox', { name: 'Game sounds' });
  await expect(backgroundMusic).toHaveAttribute('aria-checked', 'false');
  await expect(gameSounds).toHaveAttribute('aria-checked', 'true');
  expect(await soundMenu.evaluate((menu) => {
    const rect = menu.getBoundingClientRect();
    return rect.left >= 0 && rect.top >= 0 && rect.right <= window.innerWidth && rect.bottom <= window.innerHeight;
  })).toBe(true);

  const firstMusicRequest = page.waitForRequest((request) => request.url().endsWith('/music/shanghai.mp3'));
  await backgroundMusic.click();
  await firstMusicRequest;
  await gameSounds.click();
  await expect(backgroundMusic).toHaveAttribute('aria-checked', 'true');
  await expect(gameSounds).toHaveAttribute('aria-checked', 'false');
  expect(await page.evaluate(() => ({
    music: window.localStorage.getItem('badam-satti-background-music'),
    gameSounds: window.localStorage.getItem('badam-satti-sound'),
  }))).toEqual({ music: 'on', gameSounds: 'off' });
  await page.keyboard.press('Escape');
  await expect(soundMenu).not.toBeVisible();

  const guest = await newPlayerPage(browser, {}, baseURL || '');
  const third = await newPlayerPage(browser, {}, baseURL || '');
  await joinRoom(guest.page, roomCode, 'Music Guest');
  await joinRoom(third.page, roomCode, 'Music Third');
  await page.locator('.start-button').click();
  await expect(page.locator('.game-screen')).toBeVisible();

  await page.getByRole('button', { name: 'Sound settings' }).click();
  const gameSoundMenu = page.getByRole('group', { name: 'Sound settings' });
  await expect(gameSoundMenu.getByRole('checkbox', { name: 'Background music' })).toHaveAttribute('aria-checked', 'true');
  await expect(gameSoundMenu.getByRole('checkbox', { name: 'Game sounds' })).toHaveAttribute('aria-checked', 'false');

  await guest.context.close();
  await third.context.close();
});

test('room session survives waiting and active-game refreshes with a safe recovery exit', async ({ browser, page, baseURL }, testInfo) => {
  const projectUse = testInfo.project.use as BrowserContextOptions;
  const contextOptions: BrowserContextOptions = {
    viewport: page.viewportSize() || projectUse.viewport || { width: 1280, height: 720 },
    deviceScaleFactor: projectUse.deviceScaleFactor,
    isMobile: projectUse.isMobile,
    hasTouch: projectUse.hasTouch,
  };

  await login(page, 'Host');
  const roomCode = await createRoom(page);
  await expectWaitingToolbar(page);
  await page.getByRole('button', { name: 'How to play' }).click();
  await expect(page.getByRole('dialog', { name: 'How to play' })).toBeVisible();
  await page.getByRole('button', { name: 'Close help' }).click();

  const guest = await newPlayerPage(browser, contextOptions, baseURL || '');
  await joinRoom(guest.page, roomCode, 'Guest');
  const third = await newPlayerPage(browser, contextOptions, baseURL || '');
  await joinRoom(third.page, roomCode, 'Third');
  await guest.page.reload();

  await expect(guest.page.locator('.waiting-screen')).toBeVisible();
  await expect(guest.page.locator('.invite-copy strong')).toHaveText(roomCode);
  await expect(guest.page.locator('.player-item').filter({ hasText: 'Guest' })).not.toHaveClass(/disconnected/);
  await expect(page.locator('.player-item')).toHaveCount(3);

  await page.locator('.start-button').click();
  await expect(guest.page.locator('.game-screen')).toBeVisible();
  const handSizeBeforeReload = await guest.page.locator('.hand-card').count();
  expect(handSizeBeforeReload).toBeGreaterThan(0);

  await guest.page.reload();
  await expect(guest.page.locator('.game-screen')).toBeVisible();
  await expect(guest.page.locator('.hand-card')).toHaveCount(handSizeBeforeReload);

  const secondHost = await newPlayerPage(browser, contextOptions, baseURL || '');
  await login(secondHost.page, 'Second Host');
  const secondRoomCode = await createRoom(secondHost.page);
  await joinRoom(guest.page, secondRoomCode, 'Guest');
  await expect(guest.page.locator('.invite-copy strong')).toHaveText(secondRoomCode);
  await expect(secondHost.page.locator('.player-item')).toHaveCount(2);
  await expect(page.locator('.table-player').filter({ hasText: 'Guest' })).toHaveClass(/is-disconnected/);

  const missingRoom = await newPlayerPage(browser, contextOptions, baseURL || '');
  await missingRoom.page.addInitScript(() => {
    window.localStorage.setItem('badam-satti-room-session', JSON.stringify({
      roomCode: 'ZZZZZZ',
      username: 'Returning Player',
      sessionToken: '00000000-0000-4000-8000-000000000000',
    }));
  });
  await missingRoom.page.goto('/badam7/');

  const recoveryDialog = missingRoom.page.getByRole('alertdialog');
  await expect(recoveryDialog).toContainText('Your saved seat is no longer available.');
  await expect(recoveryDialog.getByRole('button', { name: 'Reconnect to room' })).toBeVisible();
  await recoveryDialog.getByRole('button', { name: 'Leave room' }).click();
  await expect(missingRoom.page.locator('.lobby-screen')).toBeVisible();
  expect(await missingRoom.page.evaluate(() => window.localStorage.getItem('badam-satti-room-session'))).toBeNull();

  await guest.context.close();
  await third.context.close();
  await secondHost.context.close();
  await missingRoom.context.close();
});

test('round results survive a player refresh', async ({ browser, page, baseURL }, testInfo) => {
  const projectUse = testInfo.project.use as BrowserContextOptions;
  const contextOptions: BrowserContextOptions = {
    viewport: page.viewportSize() || projectUse.viewport || { width: 1280, height: 720 },
    deviceScaleFactor: projectUse.deviceScaleFactor,
    isMobile: projectUse.isMobile,
    hasTouch: projectUse.hasTouch,
  };

  await login(page, 'Host');
  const roomCode = await createRoom(page);
  const guest = await newPlayerPage(browser, contextOptions, baseURL || '');
  const third = await newPlayerPage(browser, contextOptions, baseURL || '');
  await joinRoom(guest.page, roomCode, 'Guest');
  await joinRoom(third.page, roomCode, 'Third');

  const connectionDotInsets = await page.locator('.player-item').evaluateAll((items) =>
    items.map((item) => {
      const itemRect = item.getBoundingClientRect();
      const dotRect = item.querySelector('.connection-dot')!.getBoundingClientRect();
      return itemRect.right - dotRect.right;
    }),
  );
  expect(connectionDotInsets.every((inset) => Math.abs(inset) < 0.1)).toBe(true);

  await page.locator('.start-button').click();
  await expect(guest.page.locator('.game-screen')).toBeVisible();
  const finishResponse = await fetch(`${baseURL}/__test__/rooms/${roomCode}/finish-round`, {
    method: 'POST',
  });
  expect(finishResponse.ok).toBe(true);

  await expect(page.locator('.results-reveal-screen')).toBeVisible({ timeout: 6_000 });
  const countingLayout = await page.locator('.results-reveal-screen').evaluate((screen) => {
    const screenRect = screen.getBoundingClientRect();
    const menuRect = screen.querySelector('.results-game-desk')?.getBoundingClientRect();
    const scoreRect = screen.querySelector('.score-counting')?.getBoundingClientRect();
    return {
      screenCenter: screenRect.left + screenRect.width / 2,
      menuCenter: menuRect ? menuRect.left + menuRect.width / 2 : null,
      menuBottom: menuRect?.bottom ?? null,
      scoreCenter: scoreRect ? scoreRect.left + scoreRect.width / 2 : null,
      scoreTop: scoreRect?.top ?? null,
    };
  });
  expect(countingLayout.menuCenter).not.toBeNull();
  expect(countingLayout.scoreCenter).not.toBeNull();
  expect(Math.abs(countingLayout.menuCenter! - countingLayout.screenCenter)).toBeLessThan(1);
  expect(Math.abs(countingLayout.scoreCenter! - countingLayout.screenCenter)).toBeLessThan(1);
  expect(countingLayout.menuBottom!).toBeLessThanOrEqual(countingLayout.scoreTop!);

  await expect(guest.page.locator('.results-screen')).toBeVisible({ timeout: 8_000 });
  await expect(guest.page.getByText('Host won.')).toBeVisible();
  await guest.page.reload();
  await expect(guest.page.locator('.results-screen')).toBeVisible();
  await expect(guest.page.getByText('Host won.')).toBeVisible();
  await expect(guest.page.getByRole('button', { name: 'Finish game' })).toHaveCount(0);

  await expect(page.locator('.results-screen')).toBeVisible();
  await expect(page.getByText('You won!')).toBeVisible();
  await expect(page.locator('.round-winner-confetti')).toHaveCount(1);
  await expect(guest.page.locator('.round-winner-confetti')).toHaveCount(0);
  if (process.env.CAPTURE_HAND_SCREENSHOTS === '1') {
    await page.screenshot({ path: `/tmp/badam-round-winner-${testInfo.project.name}.png` });
    await guest.page.screenshot({ path: `/tmp/badam-round-winner-other-${testInfo.project.name}.png` });
  }
  await page.getByRole('button', { name: /Next round/ }).click();
  const hostSummary = page.locator('.deal-reveal-screen');
  await expect(hostSummary).toBeVisible();
  await expect(hostSummary).toContainText('Round 2');
  await expect(hostSummary.locator('.round-reveal-tile')).toHaveCount(3);
  await expect(hostSummary).toContainText('Highest score');
  await expect(hostSummary).toContainText('Guest deals');
  await expect(hostSummary).toContainText('7♥');
  await expect(hostSummary).toContainText('Extra card');
  await expect(hostSummary).toContainText('Third');
  await expect(guest.page.locator('.deal-reveal-screen')).toContainText('Round 2');
  await expect(third.page.locator('.deal-reveal-screen')).toContainText('Third');

  await page.waitForTimeout(3_600);
  const summaryLayout = await page.evaluate(() => {
    const tiles = Array.from(document.querySelectorAll<HTMLElement>('.round-reveal-tile'));
    const rects = tiles.map((tile) => tile.getBoundingClientRect());
    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      page: {
        width: document.documentElement.scrollWidth,
        height: document.documentElement.scrollHeight,
      },
      tiles: rects.map((rect, index) => ({
        index,
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        opacity: getComputedStyle(tiles[index]).opacity,
      })),
    };
  });
  expect(summaryLayout.page.width, 'round summary must not scroll horizontally').toBeLessThanOrEqual(summaryLayout.viewport.width + 1);
  expect(summaryLayout.page.height, 'round summary must fit without vertical scrolling').toBeLessThanOrEqual(summaryLayout.viewport.height + 1);
  expect(summaryLayout.tiles.every((tile) =>
    tile.left >= -1 &&
    tile.top >= -1 &&
    tile.right <= summaryLayout.viewport.width + 1 &&
    tile.bottom <= summaryLayout.viewport.height + 1
  ), `round summary rows must stay inside the phone viewport: ${JSON.stringify(summaryLayout)}`).toBe(true);
  expect(summaryLayout.tiles.slice(1).every((tile, index) =>
    summaryLayout.tiles[index].bottom <= tile.top
  ), 'round summary rows must remain stacked without overlap').toBe(true);
  expect(summaryLayout.tiles.every((tile) => tile.opacity === '1'), 'all three rows should remain visible together').toBe(true);

  if (process.env.CAPTURE_HAND_SCREENSHOTS === '1') {
    await page.screenshot({ path: `/tmp/badam-round-two-${testInfo.project.name}.png` });
    await third.page.screenshot({ path: `/tmp/badam-round-two-extra-${testInfo.project.name}.png` });
  }

  await guest.context.close();
  await third.context.close();
});

test('overall winner sees the final celebration', async ({ browser, page, baseURL }, testInfo) => {
  const projectUse = testInfo.project.use as BrowserContextOptions;
  const contextOptions: BrowserContextOptions = {
    viewport: page.viewportSize() || projectUse.viewport || { width: 1280, height: 720 },
    deviceScaleFactor: projectUse.deviceScaleFactor,
    isMobile: projectUse.isMobile,
    hasTouch: projectUse.hasTouch,
  };

  await login(page, 'Host');
  const roomCode = await createRoom(page);
  const guest = await newPlayerPage(browser, contextOptions, baseURL || '');
  const third = await newPlayerPage(browser, contextOptions, baseURL || '');
  await joinRoom(guest.page, roomCode, 'Guest');
  await joinRoom(third.page, roomCode, 'Third');
  await page.locator('.start-button').click();
  await expect(guest.page.locator('.game-screen')).toBeVisible();

  const finishResponse = await fetch(`${baseURL}/__test__/rooms/${roomCode}/finish-round`, { method: 'POST' });
  expect(finishResponse.ok).toBe(true);
  await expect(page.locator('.results-screen')).toBeVisible({ timeout: 8_000 });
  await page.getByRole('button', { name: 'Finish game' }).click();
  await expect(page.locator('.summary-screen')).toBeVisible();
  await expect(page.getByText('You won the game!')).toBeVisible();
  await expect(page.locator('.winner-fireworks')).toHaveCount(1);
  await expect(guest.page.locator('.winner-fireworks')).toHaveCount(0);
  if (process.env.CAPTURE_HAND_SCREENSHOTS === '1') {
    await page.waitForTimeout(350);
    await page.screenshot({ path: `/tmp/badam-overall-winner-${testInfo.project.name}.png` });
  }

  await guest.context.close();
  await third.context.close();
});

test('a confirmed departure sends both remaining players to the menu', async ({ browser, page, baseURL }, testInfo) => {
  const projectUse = testInfo.project.use as BrowserContextOptions;
  const contextOptions: BrowserContextOptions = {
    viewport: page.viewportSize() || projectUse.viewport || { width: 1280, height: 720 },
    deviceScaleFactor: projectUse.deviceScaleFactor,
    isMobile: projectUse.isMobile,
    hasTouch: projectUse.hasTouch,
  };

  await login(page, 'Host');
  const roomCode = await createRoom(page);
  const guest = await newPlayerPage(browser, contextOptions, baseURL || '');
  const third = await newPlayerPage(browser, contextOptions, baseURL || '');
  await joinRoom(guest.page, roomCode, 'Guest');
  await joinRoom(third.page, roomCode, 'Third');

  await page.locator('.start-button').click();
  await expect(guest.page.locator('.game-screen')).toBeVisible();
  await guest.page.getByRole('button', { name: 'Leave game' }).click();
  await guest.page.getByRole('dialog', { name: 'Leave this game?' }).getByRole('button', { name: 'Leave game' }).click();

  await expect(page.locator('.lobby-screen')).toBeVisible();
  await expect(third.page.locator('.lobby-screen')).toBeVisible();
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  await expect(third.page.getByRole('alertdialog')).toHaveCount(0);
  await expect(page.getByRole('status')).toContainText('All other players have left');
  await expect(third.page.getByRole('status')).toContainText('All other players have left');

  await guest.context.close();
  await third.context.close();
});

test('seven-player game renders and starts across responsive viewports', async ({ browser, page, baseURL }, testInfo) => {
  const projectUse = testInfo.project.use as BrowserContextOptions;
  const zoom = testInfo.project.name.includes('125-zoom') ? 1.25 : 1;
  const contextOptions: BrowserContextOptions = {
    viewport: page.viewportSize() || projectUse.viewport || { width: 1280, height: 720 },
    deviceScaleFactor: projectUse.deviceScaleFactor,
    isMobile: projectUse.isMobile,
    hasTouch: projectUse.hasTouch,
  };

  await login(page, PLAYERS[0]);
  await expectNoThemeToggle(page);
  const menuTextSizeButton = page.locator('.app-header .menu-text-size-button');
  await expect(menuTextSizeButton).toBeVisible();
  await menuTextSizeButton.click();
  await menuTextSizeButton.click();
  await menuTextSizeButton.click();
  await expect(menuTextSizeButton).toHaveText('A+++');
  expect(await page.evaluate(() => document.body.scrollWidth <= window.innerWidth)).toBe(true);

  const roomCode = await createRoom(page);
  await expectNoThemeToggle(page);
  await expectWaitingToolbar(page);
  const extraPlayers = [];
  for (const name of PLAYERS.slice(1)) {
    const player = await newPlayerPage(browser, contextOptions, baseURL || '');
    extraPlayers.push(player);
    await joinRoom(player.page, roomCode, name);
  }

  await expect(page.locator('.player-item')).toHaveCount(PLAYERS.length);
  await page.locator('.start-button').click();

  const pages = [page, ...extraPlayers.map((player) => player.page)];
  await expect(page.locator('.round-intro')).toBeVisible();
  await expect(page.locator('.round-intro')).toHaveText(/Round 1\s*Tap to play/);
  await expect(page.locator('.round-intro')).not.toContainText(/deals|clockwise|starts the board|extra card/i);
  await expect(page.locator('.player-move-notice')).toHaveCount(1);
  await expect(page.locator('.player-move-notice')).toContainText('7');
  await expect(page.locator('.player-move-notice .suit-icon')).toBeVisible();
  await expect(page.locator('.play-history')).toHaveCount(0);
  await expect(page.locator('.suit-pile[data-suit="clubs"] .empty-pile .suit-icon path')).toHaveCount(1);
  await expect(page.locator('.suit-pile[data-suit="spades"] .empty-pile .suit-icon path')).toHaveCount(2);
  for (const suit of ['H', 'D', 'C', 'S']) {
    for (const rank of ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']) {
      const response = await fetch(`${baseURL}/badam7/images/cards/${rank}${suit}.svg`);
      expect(response.ok, `${rank}${suit} asset should load`).toBe(true);
      const markup = await response.text();
      expect(markup.match(/data-card-corner="bottom-right"/g), `${rank}${suit} should have one bottom-right index`).toHaveLength(1);
      expect(markup, `${rank}${suit} bottom-right index should stay upright`).not.toMatch(/data-card-corner="bottom-right"[^>]*transform=/);
      expect(markup, `${rank}${suit} should place the bottom rank inside the right edge`).toContain(`y="104"`);
      expect(markup, `${rank}${suit} should place the bottom suit inside the right edge`).toContain('translate(85 121)');
    }
  }
  for (const rank of [7, 8, 9, 10]) {
    const response = await fetch(`${baseURL}/badam7/images/cards/${rank}C.svg`);
    expect(response.ok, `${rank} of Clubs asset should load`).toBe(true);
    const markup = await response.text();
    expect(markup, `${rank} of Clubs should use the classic connected shape`).toContain('M0-32C-11-32');
    expect(markup.match(/scale\(0\.15\)/g)?.length, `${rank} of Clubs should use Airy center pips`).toBe(rank);
  }
  for (const [index, playerPage] of pages.entries()) {
    await expect(playerPage.locator('.game-screen')).toBeVisible();
    await applyZoom(playerPage, zoom);
    await expectNoThemeToggle(playerPage);
    await expect(playerPage.locator('.table-player')).toHaveCount(PLAYERS.length);
    await expect(playerPage.locator('.game-top-bar .pass-turn-status')).toHaveCount(0);
    await expect(playerPage.locator('.hand-pass-button')).toBeVisible();
    await expectGameLayoutStable(playerPage, `${testInfo.project.name}:player-${index + 1}`);
  }

  const regularHandResponse = await fetch(`${baseURL}/__test__/rooms/${roomCode}/hand-layout?player=Host&count=13`, { method: 'POST' });
  expect(regularHandResponse.ok).toBe(true);
  await expect(page.locator('.hand-card')).toHaveCount(13);
  for (const playerPage of pages) {
    await expect(playerPage.locator('.seat-turn-bar')).toHaveCount(0);
  }
  const phonePortrait = testInfo.project.name.includes('mobile-390') || testInfo.project.name.includes('small-phone');
  await expectFourSectionHandStable(page, `${testInfo.project.name}:thirteen-card-hand`, phonePortrait);
  if (process.env.CAPTURE_HAND_SCREENSHOTS === '1') {
    await expect(page.locator('.round-intro')).toBeHidden();
    await expect(page.locator('.notification')).toBeHidden();
    await page.screenshot({ path: `/tmp/badam-hand-${testInfo.project.name}-13.png` });
  }
  const handCountBeforeSelection = await page.locator('.hand-card').count();
  const firstPlayableCard = page.locator('.hand-card.playable').first();
  const playableTransformBeforeSelection = await firstPlayableCard.evaluate((card) => {
    const matrix = new DOMMatrixReadOnly(getComputedStyle(card).transform);
    return { scale: matrix.a, lift: matrix.m42 };
  });
  await expect(page.locator('.hand-card-corner')).toHaveCount(0);
  await expect(firstPlayableCard.locator('img')).toHaveAttribute('src', /\?v10$/);
  await firstPlayableCard.click({ position: { x: 5, y: 5 } });
  await expect(page.locator('.hand-card.is-selected')).toHaveCount(1);
  await expect(page.locator('.hand-card')).toHaveCount(handCountBeforeSelection);
  await expect(page.locator('.hand-pass-button')).toHaveClass(/is-card-confirm/);
  await expect(page.locator('.hand-pass-button')).toHaveAttribute('aria-label', /^Play /);
  await expect.poll(() => page.locator('.hand-card.is-selected').evaluate((card) => {
    const matrix = new DOMMatrixReadOnly(getComputedStyle(card).transform);
    return { scale: matrix.a, lift: matrix.m42 };
  })).toEqual(playableTransformBeforeSelection);
  if (process.env.CAPTURE_HAND_SCREENSHOTS === '1') {
    await page.screenshot({ path: `/tmp/badam-card-selected-${testInfo.project.name}.png` });
  }
  const confirmCardButton = page.locator('.hand-pass-button');
  if (zoom === 1) {
    await confirmCardButton.click();
  } else {
    await confirmCardButton.focus();
    await confirmCardButton.press('Enter');
  }
  await expect(page.locator('.hand-card')).toHaveCount(handCountBeforeSelection - 1);
  await expect(page.locator('.hand-card-corner')).toHaveCount(0);

  const normalPillBackground = await page.locator('.table-player.is-you').evaluate((pill) => getComputedStyle(pill).backgroundColor);
  const criticalHandResponse = await fetch(`${baseURL}/__test__/rooms/${roomCode}/hand-layout?player=Host&critical=1`, { method: 'POST' });
  expect(criticalHandResponse.ok).toBe(true);
  await expect(page.locator('.hand-card')).toHaveCount(4);
  const criticalPill = page.locator('.table-player.is-you');
  await expect(criticalPill).toHaveClass(/critical-warning/);
  await expect(criticalPill).toHaveCSS('border-top-color', 'rgb(240, 113, 103)');
  expect(await criticalPill.evaluate((pill) => getComputedStyle(pill).backgroundColor)).not.toBe(normalPillBackground);
  if (process.env.CAPTURE_HAND_SCREENSHOTS === '1') {
    await page.screenshot({ path: `/tmp/badam-critical-pill-${testInfo.project.name}.png` });
  }

  const maximumHandResponse = await fetch(`${baseURL}/__test__/rooms/${roomCode}/hand-layout?player=Host&count=18`, { method: 'POST' });
  expect(maximumHandResponse.ok).toBe(true);
  await expect(page.locator('.hand-card')).toHaveCount(18);
  await expectFourSectionHandStable(page, `${testInfo.project.name}:eighteen-card-hand`, phonePortrait);
  await expectGameLayoutStable(page, `${testInfo.project.name}:eighteen-card-hand`);
  if (process.env.CAPTURE_HAND_SCREENSHOTS === '1') {
    await page.screenshot({ path: `/tmp/badam-hand-${testInfo.project.name}-18.png` });
  }

  const stackedBoardResponse = await fetch(`${baseURL}/__test__/rooms/${roomCode}/board-run?highest=13&includeSix=1`, { method: 'POST' });
  expect(stackedBoardResponse.ok).toBe(true);
  for (const [index, playerPage] of pages.entries()) {
    await expect(playerPage.locator('.board-card-img')).toHaveCount(12);
    await expect(playerPage.locator('.board-card-img[alt^="K of"]')).toHaveCount(4);
    await expect(playerPage.locator('.board-card-img[alt^="7 of"]')).toHaveCount(4);
    await expect(playerPage.locator('.board-card-img[alt^="6 of"]')).toHaveCount(4);
    await expectGameLayoutStable(playerPage, `${testInfo.project.name}:stacked-player-${index + 1}`);
  }

  await extraPlayers[0].page.getByRole('link', { name: 'Main menu — choose a game' }).click();
  await expect(extraPlayers[0].page).toHaveURL(/\/$/);
  await expect(page.locator('.table-player')).toHaveCount(PLAYERS.length - 1);

  await Promise.all(extraPlayers.map((player) => player.context.close()));
});

test('five-player phone table keeps seats clear of stacked board cards', async ({ browser, page, baseURL }, testInfo) => {
  test.skip(
    !testInfo.project.name.includes('mobile-390') && !testInfo.project.name.includes('small-phone'),
    'Phone layout regression',
  );

  const projectUse = testInfo.project.use as BrowserContextOptions;
  const contextOptions: BrowserContextOptions = {
    viewport: page.viewportSize() || projectUse.viewport || { width: 390, height: 844 },
    deviceScaleFactor: projectUse.deviceScaleFactor,
    isMobile: projectUse.isMobile,
    hasTouch: projectUse.hasTouch,
  };

  await login(page, FIVE_PLAYERS[0]);
  const textSizeButton = page.locator('.app-header .menu-text-size-button');
  await textSizeButton.click();
  await textSizeButton.click();
  await textSizeButton.click();
  await expect(textSizeButton).toHaveText('A+++');

  const roomCode = await createRoom(page);
  const extraPlayers = [];
  for (const name of FIVE_PLAYERS.slice(1)) {
    const player = await newPlayerPage(browser, contextOptions, baseURL || '');
    extraPlayers.push(player);
    await joinRoom(player.page, roomCode, name);
  }

  await page.locator('.start-button').click();
  await expect(page.locator('.game-screen')).toBeVisible();
  await page.locator('.round-intro').click();

  const stackedBoardResponse = await fetch(`${baseURL}/__test__/rooms/${roomCode}/board-run?highest=13&includeSix=1`, { method: 'POST' });
  expect(stackedBoardResponse.ok).toBe(true);
  await expect(page.locator('.board-card-img')).toHaveCount(12);
  await expect(page.locator('.table-player')).toHaveCount(FIVE_PLAYERS.length);
  await expectGameLayoutStable(page, `${testInfo.project.name}:five-player-stacked-board`);
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight + 1)).toBe(true);

  if (process.env.CAPTURE_HAND_SCREENSHOTS === '1') {
    await expect(page.locator('.notification')).toBeHidden();
    await page.screenshot({ path: `/tmp/badam-five-player-${testInfo.project.name}.png` });
  }

  await Promise.all(extraPlayers.map((player) => player.context.close()));
});
