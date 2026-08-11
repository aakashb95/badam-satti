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

async function startServer(t, extraEnv = {}) {
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
      ...extraEnv,
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

test('room state checks return codes that distinguish ended rooms from expired seats', async (t) => {
  const { baseUrl } = await startServer(t);
  const client = await connectClient(baseUrl);
  t.after(() => client.close());

  const noSeatError = once(client, 'error');
  client.emit('get_state');
  assert.equal((await noSeatError).code, 'RECONNECT_UNAVAILABLE');

  const missingRoomError = once(client, 'error');
  const endedRoom = new Promise((resolve) => client.once('game_abandoned', resolve));
  client.emit('reconnect_to_room', {
    roomCode: 'ZZZZZZ',
    username: 'Old Tab',
    sessionToken: '00000000-0000-4000-8000-000000000000',
  });
  assert.equal((await missingRoomError).code, 'ROOM_NOT_FOUND');
  assert.equal((await endedRoom).message, 'This game has ended.');
});

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
  const guestSession = await joinRoom(guest, roomCode, 'Guest');

  const hostSawTemporaryDisconnect = once(host, 'player_temporarily_disconnected');
  guest.close();
  const temporaryDisconnect = await hostSawTemporaryDisconnect;
  assert.equal(temporaryDisconnect.gameState.players.find((player) => player.name === 'Guest').connected, false);

  const reconnectedGuest = await connectClient(baseUrl);
  t.after(() => reconnectedGuest.close());
  const hostSawReconnect = once(host, 'player_reconnected');
  const guestReconnected = once(reconnectedGuest, 'room_reconnected');
  reconnectedGuest.emit('reconnect_to_room', {
    roomCode,
    username: 'Guest',
    sessionToken: guestSession.sessionToken,
  });
  const [hostEvent, guestEvent] = await Promise.all([hostSawReconnect, guestReconnected]);

  assert.equal(hostEvent.gameState.players.find((player) => player.name === 'Guest').connected, true);
  assert.equal(guestEvent.roomCode, roomCode);
  assert.deepEqual(guestEvent.gameState.players.map((player) => player.name), ['Host', 'Guest']);
});

test('a different socket cannot claim a connected seat without its token', async (t) => {
  const { baseUrl } = await startServer(t);
  const host = await connectClient(baseUrl);
  const attacker = await connectClient(baseUrl);
  t.after(() => {
    host.close();
    attacker.close();
  });

  const { roomCode } = await createRoom(host, 'Host');
  const rejected = once(attacker, 'error');
  attacker.emit('reconnect_to_room', {
    roomCode,
    username: 'Host',
    sessionToken: '00000000-0000-4000-8000-000000000000',
  });

  assert.equal((await rejected).code, 'RECONNECT_UNAVAILABLE');
  const hostState = once(host, 'game_state');
  host.emit('get_state');
  assert.equal((await hostState).players[0].connected, true);
});

test('a valid token replaces a stale connected socket without losing the seat', async (t) => {
  const { baseUrl } = await startServer(t);
  const originalHost = await connectClient(baseUrl);
  const replacementHost = await connectClient(baseUrl);
  t.after(() => {
    originalHost.close();
    replacementHost.close();
  });

  const hostSession = await createRoom(originalHost, 'Host');
  const reconnected = once(replacementHost, 'room_reconnected');
  replacementHost.emit('reconnect_to_room', {
    roomCode: hostSession.roomCode,
    username: 'Host',
    sessionToken: hostSession.sessionToken,
  });
  await reconnected;

  originalHost.close();
  await wait(50);

  const replacementState = once(replacementHost, 'game_state');
  replacementHost.emit('get_state');
  const state = await replacementState;
  assert.deepEqual(state.players.map((player) => player.name), ['Host']);
  assert.equal(state.players[0].connected, true);
});

test('a reserved waiting-room seat requires its session token', async (t) => {
  const { baseUrl } = await startServer(t);
  const host = await connectClient(baseUrl);
  const guest = await connectClient(baseUrl);
  t.after(() => {
    host.close();
    guest.close();
  });

  const { roomCode } = await createRoom(host, 'Host');
  const guestSession = await joinRoom(guest, roomCode, 'Guest');

  const temporaryDisconnect = once(host, 'player_temporarily_disconnected');
  guest.close();
  await temporaryDisconnect;

  const returningGuest = await connectClient(baseUrl);
  t.after(() => returningGuest.close());
  const missingTokenError = once(returningGuest, 'error');
  returningGuest.emit('join_room', { roomCode, username: 'Guest' });
  assert.equal((await missingTokenError).code, 'RECONNECT_REQUIRED');

  const hostSawReconnect = once(host, 'player_reconnected');
  const reclaimedSeat = once(returningGuest, 'room_reconnected');
  returningGuest.emit('reconnect_to_room', {
    roomCode,
    username: 'Guest',
    sessionToken: guestSession.sessionToken,
  });
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

  const attacker = await connectClient(baseUrl);
  t.after(() => attacker.close());
  const attackerError = once(attacker, 'error');
  attacker.emit('reconnect_to_room', {
    roomCode,
    username: 'Guest',
    sessionToken: '00000000-0000-4000-8000-000000000000',
  });
  assert.equal((await attackerError).code, 'RECONNECT_UNAVAILABLE');
});

test('starting removes disconnected waiting players before cards are dealt', async (t) => {
  const { baseUrl } = await startServer(t);
  const host = await connectClient(baseUrl);
  const guest = await connectClient(baseUrl);
  const third = await connectClient(baseUrl);
  const fourth = await connectClient(baseUrl);
  t.after(() => {
    host.close();
    guest.close();
    third.close();
    fourth.close();
  });

  const { roomCode } = await createRoom(host, 'Host');
  const guestSession = await joinRoom(guest, roomCode, 'Guest');
  await joinRoom(third, roomCode, 'Third');
  await joinRoom(fourth, roomCode, 'Fourth');

  const temporaryDisconnect = once(host, 'player_temporarily_disconnected');
  guest.close();
  await temporaryDisconnect;

  const removed = once(host, 'player_disconnected');
  const hostStarted = once(host, 'game_started');
  const thirdStarted = once(third, 'game_started');
  const fourthStarted = once(fourth, 'game_started');
  const hostCards = once(host, 'your_cards');
  const thirdCards = once(third, 'your_cards');
  const fourthCards = once(fourth, 'your_cards');
  host.emit('start_game');

  const [removedEvent, hostStartEvent, thirdStartEvent, fourthStartEvent, hostHand, thirdHand, fourthHand] = await Promise.all([
    removed,
    hostStarted,
    thirdStarted,
    fourthStarted,
    hostCards,
    thirdCards,
    fourthCards,
  ]);

  assert.equal(removedEvent.playerName, 'Guest');
  assert.deepEqual(hostStartEvent.gameState.players.map((player) => player.name), ['Host', 'Third', 'Fourth']);
  assert.deepEqual(thirdStartEvent.gameState.players.map((player) => player.name), ['Host', 'Third', 'Fourth']);
  assert.deepEqual(fourthStartEvent.gameState.players.map((player) => player.name), ['Host', 'Third', 'Fourth']);
  assert.equal(hostStartEvent.gameState.players.every((player) => player.connected), true);
  assert.equal(hostHand.cards.length + thirdHand.cards.length + fourthHand.cards.length, 51);

  const returningGuest = await connectClient(baseUrl);
  t.after(() => returningGuest.close());
  const reconnectError = once(returningGuest, 'error');
  returningGuest.emit('reconnect_to_room', {
    roomCode,
    username: 'Guest',
    sessionToken: guestSession.sessionToken,
  });
  assert.equal((await reconnectError).code, 'RECONNECT_UNAVAILABLE');
});

test('starting fails after cleanup when fewer than three connected players remain', async (t) => {
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
    connectClient(baseUrl),
  ]);
  t.after(() => sockets.forEach((socket) => socket.close()));

  const [host, guest, third, fourth] = sockets;
  const { roomCode } = await createRoom(host, 'Host');
  await joinRoom(guest, roomCode, 'Guest');
  await joinRoom(third, roomCode, 'Third');
  await joinRoom(fourth, roomCode, 'Fourth');

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

  assert.deepEqual(names, ['Host', 'Third', 'Fourth']);
  assert.equal(remainingCards, 51);
  assert.equal(removedEvent.gameState.players.every((player) => player.connected), true);
  assert.deepEqual(leaveResult, { ok: true });
});

test('explicit leave ends the game cleanly when only two players remain', async (t) => {
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
  host.emit('start_game');
  await started;

  let redistributionCount = 0;
  let removalCount = 0;
  host.on('cards_redistributed', () => { redistributionCount += 1; });
  host.on('player_disconnected', () => { removalCount += 1; });
  const abandonedForHost = once(host, 'game_abandoned');
  const abandonedForThird = once(third, 'game_abandoned');
  const guestLeft = once(guest, 'left_room');
  guest.emit('leave_room');

  const [hostAbandoned, thirdAbandoned] = await Promise.all([
    abandonedForHost,
    abandonedForThird,
    guestLeft,
  ]);

  assert.equal(hostAbandoned.message, 'All other players have left');
  assert.equal(thirdAbandoned.message, 'All other players have left');
  await wait(50);
  assert.equal(redistributionCount, 0);
  assert.equal(removalCount, 0);
});

test('expired disconnect ends the game cleanly when only two players remain', async (t) => {
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
  host.emit('start_game');
  await started;

  let redistributionCount = 0;
  let removalCount = 0;
  host.on('cards_redistributed', () => { redistributionCount += 1; });
  host.on('player_disconnected', () => { removalCount += 1; });
  const temporaryDisconnect = once(host, 'player_temporarily_disconnected');
  const abandonedForHost = once(host, 'game_abandoned');
  const abandonedForThird = once(third, 'game_abandoned');
  guest.close();

  const [temporary, hostAbandoned, thirdAbandoned] = await Promise.all([
    temporaryDisconnect,
    abandonedForHost,
    abandonedForThird,
  ]);

  assert.equal(temporary.gameState.started, true);
  assert.equal(temporary.gameState.players.find((player) => player.name === 'Guest').connected, false);
  assert.equal(hostAbandoned.message, 'All other players have left');
  assert.equal(thirdAbandoned.message, 'All other players have left');
  assert.equal(redistributionCount, 0);
  assert.equal(removalCount, 0);
});

test('active-game disconnect redistributes cards after the reconnection window', async (t) => {
  const { baseUrl } = await startServer(t);
  const sockets = await Promise.all([
    connectClient(baseUrl),
    connectClient(baseUrl),
    connectClient(baseUrl),
    connectClient(baseUrl),
  ]);
  t.after(() => sockets.forEach((socket) => socket.close()));

  const [host, guest, third, fourth] = sockets;
  const { roomCode } = await createRoom(host, 'Host');
  await joinRoom(guest, roomCode, 'Guest');
  await joinRoom(third, roomCode, 'Third');
  await joinRoom(fourth, roomCode, 'Fourth');

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
  assert.deepEqual(removedEvent.gameState.players.map((player) => player.name), ['Host', 'Third', 'Fourth']);
  assert.equal(removedEvent.gameState.players.reduce((total, player) => total + player.cardCount, 0), 51);
  assert.equal(removedEvent.gameState.players.every((player) => player.connected), true);
  await wait(100);
  assert.equal(redistributionCount, 1);
  assert.equal(removalCount, 1);
});

test('current player can reconnect and act before the existing turn deadline', async (t) => {
  const { baseUrl } = await startServer(t, { ACTIVE_GAME_RECONNECT_MS: '1200' });
  const names = ['Host', 'Guest', 'Third'];
  const sockets = await Promise.all(names.map(() => connectClient(baseUrl)));
  t.after(() => sockets.forEach((socket) => socket.close()));

  const hostSession = await createRoom(sockets[0], names[0]);
  const { roomCode } = hostSession;
  const sessions = new Map([[names[0], hostSession.sessionToken]]);
  for (let index = 1; index < sockets.length; index += 1) {
    const session = await joinRoom(sockets[index], roomCode, names[index]);
    sessions.set(names[index], session.sessionToken);
  }

  const started = Promise.all(sockets.map((socket) => once(socket, 'game_started')));
  const initialHands = Promise.all(sockets.map((socket) => once(socket, 'your_cards')));
  sockets[0].emit('start_game');
  const [startEvents, hands] = await Promise.all([started, initialHands]);
  const startingState = startEvents[0].gameState;
  const currentName = startingState.currentPlayerName;
  const currentIndex = names.indexOf(currentName);
  const currentSocket = sockets[currentIndex];
  const observer = sockets[(currentIndex + 1) % sockets.length];
  const currentHand = hands[currentIndex].cards;

  let redistributionCount = 0;
  let removalCount = 0;
  observer.on('cards_redistributed', () => { redistributionCount += 1; });
  observer.on('player_disconnected', () => { removalCount += 1; });

  const temporaryDisconnect = once(observer, 'player_temporarily_disconnected');
  currentSocket.close();
  const temporaryEvent = await temporaryDisconnect;

  assert.equal(temporaryEvent.gameState.currentPlayerName, currentName);
  assert.equal(temporaryEvent.gameState.turnStartedAt, startingState.turnStartedAt);
  assert.equal(temporaryEvent.gameState.players.find((player) => player.name === currentName).connected, false);

  await wait(100);
  const returningPlayer = await connectClient(baseUrl);
  t.after(() => returningPlayer.close());
  const reconnected = once(returningPlayer, 'room_reconnected');
  returningPlayer.emit('reconnect_to_room', {
    roomCode,
    username: currentName,
    sessionToken: sessions.get(currentName),
  });
  const reconnectEvent = await reconnected;

  assert.deepEqual(reconnectEvent.myCards, currentHand);
  assert.equal(reconnectEvent.gameState.currentPlayerName, currentName);
  assert.equal(reconnectEvent.gameState.turnStartedAt, startingState.turnStartedAt);
  assert.equal(reconnectEvent.gameState.players.filter((player) => player.name === currentName).length, 1);
  assert.equal(reconnectEvent.gameState.players.find((player) => player.name === currentName).connected, true);

  const playerActed = onceAny(observer, ['card_played', 'turn_passed']);
  if (reconnectEvent.validMoves.length > 0) {
    returningPlayer.emit('play_card', reconnectEvent.validMoves[0]);
  } else {
    returningPlayer.emit('pass_turn');
  }
  const actionEvent = await playerActed;
  assert.equal(actionEvent.payload.playerName, currentName);

  await wait(1300);
  assert.equal(redistributionCount, 0);
  assert.equal(removalCount, 0);
});

test('a weak connection does not freeze another player\'s eligible moves', async (t) => {
  const { baseUrl } = await startServer(t, { ACTIVE_GAME_RECONNECT_MS: '1200' });
  const names = ['Host', 'Guest', 'Third'];
  const sockets = await Promise.all(names.map(() => connectClient(baseUrl)));
  t.after(() => sockets.forEach((socket) => socket.close()));

  const hostSession = await createRoom(sockets[0], names[0]);
  const { roomCode } = hostSession;
  const sessions = new Map([[names[0], hostSession.sessionToken]]);
  for (let index = 1; index < sockets.length; index += 1) {
    const session = await joinRoom(sockets[index], roomCode, names[index]);
    sessions.set(names[index], session.sessionToken);
  }

  const started = Promise.all(sockets.map((socket) => once(socket, 'game_started')));
  const initialHands = Promise.all(sockets.map((socket) => once(socket, 'your_cards')));
  sockets[0].emit('start_game');
  await Promise.all([started, initialHands]);

  const arrangedHand = once(sockets[0], 'your_cards');
  const layoutResponse = await fetch(`${baseUrl}/__test__/rooms/${roomCode}/hand-layout?player=Host&count=13`, {
    method: 'POST',
  });
  assert.equal(layoutResponse.ok, true);
  assert.equal((await arrangedHand).validMoves.length, 8);

  const handDuringDrop = once(sockets[0], 'your_cards');
  sockets[2].close();
  assert.equal((await handDuringDrop).validMoves.length, 8);

  const returningPlayer = await connectClient(baseUrl);
  t.after(() => returningPlayer.close());
  const restoredHand = once(sockets[0], 'your_cards');
  const reconnected = once(returningPlayer, 'room_reconnected');
  returningPlayer.emit('reconnect_to_room', {
    roomCode,
    username: names[2],
    sessionToken: sessions.get(names[2]),
  });

  await reconnected;
  assert.equal((await restoredHand).validMoves.length, 8);
});

test('server auto-plays the disconnected current player at the original deadline', async (t) => {
  const { baseUrl } = await startServer(t, {
    ACTIVE_GAME_RECONNECT_MS: '1200',
    ENABLE_TURN_TIMERS: '1',
    TURN_TIMER_TEST_DELAY_MS: '250',
  });
  const names = ['Host', 'Guest', 'Third', 'Fourth'];
  const sockets = await Promise.all(names.map(() => connectClient(baseUrl)));
  t.after(() => sockets.forEach((socket) => socket.close()));

  const { roomCode } = await createRoom(sockets[0], names[0]);
  for (let index = 1; index < sockets.length; index += 1) {
    await joinRoom(sockets[index], roomCode, names[index]);
  }

  const started = Promise.all(sockets.map((socket) => once(socket, 'game_started')));
  sockets[0].emit('start_game');
  const startEvents = await started;
  const startingState = startEvents[0].gameState;
  const currentName = startingState.currentPlayerName;
  const currentIndex = names.indexOf(currentName);
  const currentSocket = sockets[currentIndex];
  const observer = sockets[(currentIndex + 1) % sockets.length];

  const temporaryDisconnect = once(observer, 'player_temporarily_disconnected');
  const automaticAction = onceAny(observer, ['card_played', 'turn_passed']);
  currentSocket.close();

  const temporaryEvent = await temporaryDisconnect;
  assert.equal(temporaryEvent.gameState.currentPlayerName, currentName);
  assert.equal(temporaryEvent.gameState.turnStartedAt, startingState.turnStartedAt);

  const actionEvent = await automaticAction;
  assert.equal(actionEvent.payload.playerName, currentName);
  assert.equal(actionEvent.payload.automatic, true);
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

test('server timer auto-plays for an unresponsive player', async (t) => {
  const { baseUrl } = await startServer(t, {
    ENABLE_TURN_TIMERS: '1',
    TURN_TIMER_TEST_DELAY_MS: '200',
  });
  const names = ['Host', 'North', 'East'];
  const sockets = await Promise.all(names.map(() => connectClient(baseUrl)));
  t.after(() => sockets.forEach((socket) => socket.close()));

  let winner = null;
  const automaticEvents = [];
  sockets.forEach((socket) => {
    socket.on('game_over', (payload) => { winner = payload; });
  });
  sockets[0].on('card_played', (payload) => {
    if (payload.automatic) automaticEvents.push(payload);
  });
  sockets[0].on('turn_passed', (payload) => {
    if (payload.automatic) automaticEvents.push(payload);
  });

  const { roomCode } = await createRoom(sockets[0], names[0]);
  for (let index = 1; index < sockets.length; index += 1) {
    await joinRoom(sockets[index], roomCode, names[index]);
  }

  const started = Promise.all(sockets.map((socket) => once(socket, 'game_started')));
  sockets[0].emit('start_game');
  await started;

  // Nobody touches their screen: the server must keep the game moving on
  // its own and mark those moves automatic.
  await waitForCondition(() => automaticEvents.length >= 5 || Boolean(winner), 10000);
  assert.ok(automaticEvents.length >= 5 || winner, 'server should auto-advance idle turns');
  if (automaticEvents.length) {
    const lastState = automaticEvents[automaticEvents.length - 1].gameState;
    assert.ok(lastState.turnStartedAt > 0, 'state should expose turnStartedAt');
    assert.equal(lastState.turnDurationSeconds, 20);
    const automaticHistory = lastState.playHistory.filter((entry) => entry.automatic);
    assert.ok(automaticHistory.length >= 1, 'history should mark automatic moves');
  }
});

test('host sets the turn duration and non-hosts cannot finish the game', async (t) => {
  const { baseUrl } = await startServer(t);
  const names = ['Host', 'North', 'East'];
  const sockets = await Promise.all(names.map(() => connectClient(baseUrl)));
  t.after(() => sockets.forEach((socket) => socket.close()));

  const { roomCode } = await createRoom(sockets[0], names[0]);
  for (let index = 1; index < sockets.length; index += 1) {
    await joinRoom(sockets[index], roomCode, names[index]);
  }

  // Non-host cannot change the timer
  const guestRejected = once(sockets[1], 'error');
  sockets[1].emit('set_turn_duration', 40);
  const guestError = await guestRejected.catch((error) => error);
  assert.match(String(guestError.message || guestError), /host/i);

  // Host picks 40s and everyone hears about it
  const allSeeChange = Promise.all(sockets.map((socket) => once(socket, 'turn_duration_changed')));
  sockets[0].emit('set_turn_duration', 40);
  const changes = await allSeeChange;
  changes.forEach((change) => {
    assert.equal(change.turnDurationSeconds, 40);
    assert.equal(change.gameState.turnDurationSeconds, 40);
  });

  // Play until the round finishes so exit_game is meaningful.
  // Listeners must be attached before start_game so no event is missed.
  const playerState = new Map(names.map((name) => [name, null]));
  let latestGameState = null;
  let winner = null;
  sockets.forEach((socket, index) => {
    const name = names[index];
    socket.on('your_cards', ({ validMoves }) => playerState.set(name, { validMoves }));
    socket.on('card_played', ({ gameState }) => { latestGameState = gameState; });
    socket.on('turn_passed', ({ gameState }) => { latestGameState = gameState; });
    socket.on('game_over', (payload) => { winner = payload; });
  });

  const started = Promise.all(sockets.map((socket) => once(socket, 'game_started')));
  sockets[0].emit('start_game');
  const startedStates = await started;
  assert.equal(startedStates[0].gameState.turnDurationSeconds, 40);
  latestGameState = latestGameState || startedStates[0].gameState;
  await waitForCondition(() => names.every((name) => playerState.get(name)));

  for (let moveCount = 0; moveCount < 240 && !winner; moveCount += 1) {
    const currentName = latestGameState.currentPlayerName;
    const playerIndex = names.indexOf(currentName);
    const currentSocket = sockets[playerIndex];
    const serverEvent = onceAny(sockets[0], ['card_played', 'turn_passed', 'game_over']);
    const moves = playerState.get(currentName).validMoves;
    if (moves.length > 0) currentSocket.emit('play_card', moves[0]);
    else currentSocket.emit('pass_turn');
    await serverEvent;
    await wait(10);
  }
  assert.ok(winner, 'round should finish');

  // Non-host cannot finish the game
  const finishRejected = once(sockets[1], 'error');
  sockets[1].emit('exit_game');
  const finishError = await finishRejected.catch((error) => error);
  assert.match(String(finishError.message || finishError), /host/i);

  // Host can
  const totals = Promise.all(sockets.map((socket) => once(socket, 'game_totals')));
  sockets[0].emit('exit_game');
  const totalPayloads = await totals;
  assert.equal(totalPayloads[0].totals.length, names.length);
});
