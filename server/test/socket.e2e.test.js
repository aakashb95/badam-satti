const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { mkdtemp, rm } = require('node:fs/promises');
const net = require('node:net');
const { tmpdir } = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { io } = require('socket.io-client');

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : null;
      server.close(() => {
        if (port) resolve(port);
        else reject(new Error('Unable to allocate test port'));
      });
    });
  });
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function once(socket, event, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for ${event}`));
    }, timeoutMs);

    const onEvent = (payload) => {
      cleanup();
      resolve(payload);
    };

    const onError = (payload) => {
      cleanup();
      reject(new Error(typeof payload === 'string' ? payload : payload?.message || JSON.stringify(payload)));
    };

    const cleanup = () => {
      clearTimeout(timer);
      socket.off(event, onEvent);
      socket.off('error', onError);
    };

    socket.once(event, onEvent);
    if (event !== 'error') socket.once('error', onError);
  });
}

function onceAny(socket, events, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for one of: ${events.join(', ')}`));
    }, timeoutMs);

    const handlers = new Map(events.map((event) => [
      event,
      (payload) => {
        cleanup();
        resolve({ event, payload });
      },
    ]));

    const onError = (payload) => {
      cleanup();
      reject(new Error(typeof payload === 'string' ? payload : payload?.message || JSON.stringify(payload)));
    };

    const cleanup = () => {
      clearTimeout(timer);
      handlers.forEach((handler, event) => socket.off(event, handler));
      socket.off('error', onError);
    };

    handlers.forEach((handler, event) => socket.once(event, handler));
    socket.once('error', onError);
  });
}

async function waitForCondition(predicate, timeoutMs = 5000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (predicate()) return;
    await wait(5);
  }
  throw new Error('Timed out waiting for condition');
}

async function startServer(t) {
  const port = await freePort();
  const dir = await mkdtemp(path.join(tmpdir(), 'badam-satti-'));
  const dbPath = path.join(dir, 'test.db');
  const child = spawn(process.execPath, ['index.js'], {
    cwd: path.join(__dirname, '..'),
    env: {
      ...process.env,
      HOST: '127.0.0.1',
      PORT: String(port),
      DB_PATH: dbPath,
      NODE_ENV: 'test',
      ADMIN_KEY: 'test-admin-key',
      IP_HASH_SALT: 'test-salt',
      ACTIVE_GAME_RECONNECT_MS: '500',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let logs = '';
  child.stdout.on('data', (chunk) => { logs += chunk.toString(); });
  child.stderr.on('data', (chunk) => { logs += chunk.toString(); });

  const baseUrl = `http://127.0.0.1:${port}`;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`Server exited early:\n${logs}`);
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) {
        t.after(async () => {
          child.kill('SIGTERM');
          await new Promise((resolve) => child.once('exit', resolve));
          await rm(dir, { recursive: true, force: true });
        });
        return { baseUrl };
      }
    } catch {
      // Server is still starting.
    }
    await wait(100);
  }

  child.kill('SIGTERM');
  throw new Error(`Server did not become healthy:\n${logs}`);
}

async function connectClient(baseUrl) {
  const socket = io(baseUrl, {
    forceNew: true,
    reconnection: false,
    transports: ['websocket'],
  });
  await once(socket, 'connect');
  return socket;
}

async function createRoom(socket, username) {
  const created = once(socket, 'room_created');
  socket.emit('create_room', username);
  return created;
}

async function joinRoom(socket, roomCode, username) {
  const joined = once(socket, 'room_joined');
  socket.emit('join_room', { roomCode, username });
  return joined;
}

test('explicit waiting-room leave removes the player immediately', async (t) => {
  const { baseUrl } = await startServer(t);
  const host = await connectClient(baseUrl);
  const guest = await connectClient(baseUrl);
  t.after(() => {
    host.close();
    guest.close();
  });

  const { roomCode } = await createRoom(host, 'Host');
  const hostSawJoin = once(host, 'player_joined');
  await joinRoom(guest, roomCode, 'Guest');
  await hostSawJoin;

  const hostSawLeave = once(host, 'player_disconnected');
  const guestLeft = once(guest, 'left_room');
  const acknowledgement = guest.timeout(2000).emitWithAck('leave_room');
  const [leaveEvent, , leaveResult] = await Promise.all([hostSawLeave, guestLeft, acknowledgement]);

  assert.deepEqual(leaveEvent.gameState.players.map((player) => player.name), ['Host']);
  assert.equal(leaveEvent.gameState.players[0].connected, true);
  assert.deepEqual(leaveResult, { ok: true });
});

test('waiting-room reconnect restores the same player on a new socket', async (t) => {
  const { baseUrl } = await startServer(t);
  const host = await connectClient(baseUrl);
  const guest = await connectClient(baseUrl);
  t.after(() => {
    host.close();
    guest.close();
  });

  const { roomCode } = await createRoom(host, 'Host');
  await joinRoom(guest, roomCode, 'Guest');

  const hostSawTemporaryDisconnect = once(host, 'player_temporarily_disconnected');
  guest.close();
  const temporaryDisconnect = await hostSawTemporaryDisconnect;
  assert.equal(temporaryDisconnect.gameState.players.find((player) => player.name === 'Guest').connected, false);

  const reconnectedGuest = await connectClient(baseUrl);
  t.after(() => reconnectedGuest.close());
  const hostSawReconnect = once(host, 'player_reconnected');
  const guestReconnected = once(reconnectedGuest, 'room_reconnected');
  reconnectedGuest.emit('reconnect_to_room', { roomCode, username: 'Guest' });
  const [hostEvent, guestEvent] = await Promise.all([hostSawReconnect, guestReconnected]);

  assert.equal(hostEvent.gameState.players.find((player) => player.name === 'Guest').connected, true);
  assert.equal(guestEvent.roomCode, roomCode);
  assert.deepEqual(guestEvent.gameState.players.map((player) => player.name), ['Host', 'Guest']);
});

test('normal waiting-room join reclaims a reserved disconnected seat', async (t) => {
  const { baseUrl } = await startServer(t);
  const host = await connectClient(baseUrl);
  const guest = await connectClient(baseUrl);
  t.after(() => {
    host.close();
    guest.close();
  });

  const { roomCode } = await createRoom(host, 'Host');
  await joinRoom(guest, roomCode, 'Guest');

  const temporaryDisconnect = once(host, 'player_temporarily_disconnected');
  guest.close();
  await temporaryDisconnect;

  const returningGuest = await connectClient(baseUrl);
  t.after(() => returningGuest.close());
  const hostSawReconnect = once(host, 'player_reconnected');
  const reclaimedSeat = once(returningGuest, 'room_reconnected');
  returningGuest.emit('join_room', { roomCode, username: 'Guest' });
  const [hostEvent, guestEvent] = await Promise.all([hostSawReconnect, reclaimedSeat]);

  assert.deepEqual(guestEvent.gameState.players.map((player) => player.name), ['Host', 'Guest']);
  assert.equal(guestEvent.gameState.players.filter((player) => player.name === 'Guest').length, 1);
  assert.equal(hostEvent.gameState.players.find((player) => player.name === 'Guest').connected, true);

  const duplicateGuest = await connectClient(baseUrl);
  t.after(() => duplicateGuest.close());
  const duplicateError = once(duplicateGuest, 'error');
  duplicateGuest.emit('join_room', { roomCode, username: 'Guest' });
  assert.equal((await duplicateError).code, 'USERNAME_TAKEN');

  const secondTemporaryDisconnect = once(host, 'player_temporarily_disconnected');
  returningGuest.close();
  await secondTemporaryDisconnect;

  const secondReturn = await connectClient(baseUrl);
  t.after(() => secondReturn.close());
  const reclaimedAgain = once(secondReturn, 'room_reconnected');
  secondReturn.emit('join_room', { roomCode, username: 'Guest' });
  const secondReturnEvent = await reclaimedAgain;
  assert.equal(secondReturnEvent.gameState.players.filter((player) => player.name === 'Guest').length, 1);
});

test('starting removes disconnected waiting players before cards are dealt', async (t) => {
  const { baseUrl } = await startServer(t);
  const host = await connectClient(baseUrl);
  const guest = await connectClient(baseUrl);
  const third = await connectClient(baseUrl);
  t.after(() => {
    host.close();
    guest.close();
    third.close();
  });

  const { roomCode } = await createRoom(host, 'Host');
  await joinRoom(guest, roomCode, 'Guest');
  await joinRoom(third, roomCode, 'Third');

  const temporaryDisconnect = once(host, 'player_temporarily_disconnected');
  guest.close();
  await temporaryDisconnect;

  const removed = once(host, 'player_disconnected');
  const hostStarted = once(host, 'game_started');
  const thirdStarted = once(third, 'game_started');
  const hostCards = once(host, 'your_cards');
  const thirdCards = once(third, 'your_cards');
  host.emit('start_game');

  const [removedEvent, hostStartEvent, thirdStartEvent, hostHand, thirdHand] = await Promise.all([
    removed,
    hostStarted,
    thirdStarted,
    hostCards,
    thirdCards,
  ]);

  assert.equal(removedEvent.playerName, 'Guest');
  assert.deepEqual(hostStartEvent.gameState.players.map((player) => player.name), ['Host', 'Third']);
  assert.deepEqual(thirdStartEvent.gameState.players.map((player) => player.name), ['Host', 'Third']);
  assert.equal(hostStartEvent.gameState.players.every((player) => player.connected), true);
  assert.equal(hostHand.cards.length + thirdHand.cards.length, 51);

  const returningGuest = await connectClient(baseUrl);
  t.after(() => returningGuest.close());
  const reconnectError = once(returningGuest, 'error');
  returningGuest.emit('reconnect_to_room', { roomCode, username: 'Guest' });
  assert.equal((await reconnectError).code, 'RECONNECT_UNAVAILABLE');
});

test('starting fails after cleanup when fewer than two connected players remain', async (t) => {
  const { baseUrl } = await startServer(t);
  const host = await connectClient(baseUrl);
  const guest = await connectClient(baseUrl);
  t.after(() => {
    host.close();
    guest.close();
  });

  const { roomCode } = await createRoom(host, 'Host');
  await joinRoom(guest, roomCode, 'Guest');

  const temporaryDisconnect = once(host, 'player_temporarily_disconnected');
  guest.close();
  await temporaryDisconnect;

  const removed = once(host, 'player_disconnected');
  const startError = once(host, 'error');
  host.emit('start_game');
  const [removedEvent, error] = await Promise.all([removed, startError]);

  assert.equal(removedEvent.playerName, 'Guest');
  assert.equal(error.code, 'NOT_ENOUGH_CONNECTED_PLAYERS');

  const state = once(host, 'game_state');
  host.emit('get_state');
  const hostState = await state;
  assert.equal(hostState.started, false);
  assert.deepEqual(hostState.players.map((player) => player.name), ['Host']);
});

test('explicit active-game leave redistributes cards without waiting for disconnect timeout', async (t) => {
  const { baseUrl } = await startServer(t);
  const sockets = await Promise.all([
    connectClient(baseUrl),
    connectClient(baseUrl),
    connectClient(baseUrl),
  ]);
  t.after(() => sockets.forEach((socket) => socket.close()));

  const [host, guest, third] = sockets;
  const { roomCode } = await createRoom(host, 'Host');
  await joinRoom(guest, roomCode, 'Guest');
  await joinRoom(third, roomCode, 'Third');

  const started = Promise.all(sockets.map((socket) => once(socket, 'game_started')));
  const cards = Promise.all(sockets.map((socket) => once(socket, 'your_cards')));
  host.emit('start_game');
  const [startEvents] = await Promise.all([started, cards]);
  assert.equal(startEvents[0].gameState.started, true);

  const redistributed = once(host, 'cards_redistributed');
  const playerRemoved = once(host, 'player_disconnected');
  const guestLeft = once(guest, 'left_room');
  const acknowledgement = guest.timeout(2000).emitWithAck('leave_room');
  const [, removedEvent, , leaveResult] = await Promise.all([redistributed, playerRemoved, guestLeft, acknowledgement]);

  const names = removedEvent.gameState.players.map((player) => player.name);
  const remainingCards = removedEvent.gameState.players.reduce((total, player) => total + player.cardCount, 0);

  assert.deepEqual(names, ['Host', 'Third']);
  assert.equal(remainingCards, 51);
  assert.equal(removedEvent.gameState.players.every((player) => player.connected), true);
  assert.deepEqual(leaveResult, { ok: true });
});

test('active-game disconnect redistributes cards after the reconnection window', async (t) => {
  const { baseUrl } = await startServer(t);
  const sockets = await Promise.all([
    connectClient(baseUrl),
    connectClient(baseUrl),
    connectClient(baseUrl),
  ]);
  t.after(() => sockets.forEach((socket) => socket.close()));

  const [host, guest, third] = sockets;
  const { roomCode } = await createRoom(host, 'Host');
  await joinRoom(guest, roomCode, 'Guest');
  await joinRoom(third, roomCode, 'Third');

  const started = Promise.all(sockets.map((socket) => once(socket, 'game_started')));
  const cards = Promise.all(sockets.map((socket) => once(socket, 'your_cards')));
  host.emit('start_game');
  await Promise.all([started, cards]);

  let redistributionCount = 0;
  let removalCount = 0;
  host.on('cards_redistributed', () => { redistributionCount += 1; });
  host.on('player_disconnected', () => { removalCount += 1; });

  const temporaryDisconnect = once(host, 'player_temporarily_disconnected');
  const redistributed = once(host, 'cards_redistributed');
  const playerRemoved = once(host, 'player_disconnected');
  guest.close();

  const [temporaryEvent, , removedEvent] = await Promise.all([
    temporaryDisconnect,
    redistributed,
    playerRemoved,
  ]);

  assert.equal(temporaryEvent.gameState.players.find((player) => player.name === 'Guest').connected, false);
  assert.deepEqual(removedEvent.gameState.players.map((player) => player.name), ['Host', 'Third']);
  assert.equal(removedEvent.gameState.players.reduce((total, player) => total + player.cardCount, 0), 51);
  assert.equal(removedEvent.gameState.players.every((player) => player.connected), true);
  await wait(100);
  assert.equal(redistributionCount, 1);
  assert.equal(removalCount, 1);
});

test('active-game reconnect within the window restores the same hand once', async (t) => {
  const { baseUrl } = await startServer(t);
  const host = await connectClient(baseUrl);
  const guest = await connectClient(baseUrl);
  const third = await connectClient(baseUrl);
  t.after(() => {
    host.close();
    guest.close();
    third.close();
  });

  const { roomCode } = await createRoom(host, 'Host');
  await joinRoom(guest, roomCode, 'Guest');
  await joinRoom(third, roomCode, 'Third');

  const started = Promise.all([host, guest, third].map((socket) => once(socket, 'game_started')));
  const initialHands = Promise.all([host, guest, third].map((socket) => once(socket, 'your_cards')));
  host.emit('start_game');
  const [, hands] = await Promise.all([started, initialHands]);
  const guestHand = hands[1].cards;

  let redistributionCount = 0;
  let removalCount = 0;
  host.on('cards_redistributed', () => { redistributionCount += 1; });
  host.on('player_disconnected', () => { removalCount += 1; });

  const temporaryDisconnect = once(host, 'player_temporarily_disconnected');
  guest.close();
  await temporaryDisconnect;

  const returningGuest = await connectClient(baseUrl);
  t.after(() => returningGuest.close());
  const reconnected = once(returningGuest, 'room_reconnected');
  returningGuest.emit('reconnect_to_room', { roomCode, username: 'Guest' });
  const reconnectEvent = await reconnected;

  assert.deepEqual(reconnectEvent.myCards, guestHand);
  assert.equal(reconnectEvent.gameState.players.filter((player) => player.name === 'Guest').length, 1);
  assert.equal(reconnectEvent.gameState.players.find((player) => player.name === 'Guest').connected, true);

  await wait(650);
  assert.equal(redistributionCount, 0);
  assert.equal(removalCount, 0);
});

test('plays a complete round across four sockets with synchronized turns', async (t) => {
  const { baseUrl } = await startServer(t);
  const names = ['Host', 'North', 'East', 'West'];
  const sockets = await Promise.all(names.map(() => connectClient(baseUrl)));
  t.after(() => sockets.forEach((socket) => socket.close()));

  const playerState = new Map(names.map((name) => [name, { cards: [], validMoves: [] }]));
  let latestGameState = null;
  let cardsRevision = 0;
  let winner = null;

  sockets.forEach((socket, index) => {
    const name = names[index];
    socket.on('your_cards', ({ cards, validMoves }) => {
      playerState.set(name, { cards, validMoves });
      cardsRevision += 1;
    });
    socket.on('game_started', ({ gameState }) => {
      latestGameState = gameState;
    });
    socket.on('card_played', ({ gameState }) => {
      latestGameState = gameState;
    });
    socket.on('turn_passed', ({ gameState }) => {
      latestGameState = gameState;
    });
    socket.on('game_over', (payload) => {
      winner = payload;
    });
  });

  const { roomCode } = await createRoom(sockets[0], names[0]);
  for (let index = 1; index < sockets.length; index += 1) {
    await joinRoom(sockets[index], roomCode, names[index]);
  }

  const started = Promise.all(sockets.map((socket) => once(socket, 'game_started')));
  const initialCards = Promise.all(sockets.map((socket) => once(socket, 'your_cards')));
  sockets[0].emit('start_game');
  await Promise.all([started, initialCards]);

  for (let moveCount = 0; moveCount < 240 && !winner; moveCount += 1) {
    assert.ok(latestGameState?.currentPlayerName, 'server should publish the current player');
    const currentName = latestGameState.currentPlayerName;
    const playerIndex = names.indexOf(currentName);
    assert.notEqual(playerIndex, -1, `unknown current player ${currentName}`);

    const currentSocket = sockets[playerIndex];
    const currentPlayerState = playerState.get(currentName);
    const beforeRevision = cardsRevision;
    const serverEvent = onceAny(sockets[0], ['card_played', 'turn_passed', 'game_over']);

    if (currentPlayerState.validMoves.length > 0) {
      currentSocket.emit('play_card', currentPlayerState.validMoves[0]);
    } else {
      currentSocket.emit('pass_turn');
    }

    await serverEvent;
    if (!winner) {
      await waitForCondition(() => cardsRevision >= beforeRevision + sockets.length);
    }
  }

  assert.ok(winner, 'round should finish before the stress-test move cap');
  assert.equal(winner.type, 'game_complete');
  assert.equal(winner.finalScores.length, sockets.length);
  assert.equal(winner.finalScores.filter((score) => score.isWinner).length, 1);
});
