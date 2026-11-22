const path = require('path');
const http = require('http');
const crypto = require('crypto');
const { performance } = require('perf_hooks');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const { Server } = require('socket.io');
const { KitchenClashGame } = require('./game');

const PORT = Number(process.env.PORT || 5200);
const HOST = process.env.HOST || '0.0.0.0';
const ACTIVE_GAME_RECONNECT_MS = Number(process.env.ACTIVE_GAME_RECONNECT_MS || 60_000);
const WAITING_RECONNECT_MS = Number(process.env.WAITING_RECONNECT_MS || 10 * 60_000);
const PING_INTERVAL_MS = Number(process.env.PING_INTERVAL_MS || 2_000);
const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const now = () => performance.now();
const app = express();
const server = http.createServer(app);
const io = new Server(server, { path: '/kitchen-clash/socket.io', cors: { origin: true, credentials: true }, pingTimeout: 120_000, pingInterval: 30_000 });
const rooms = new Map();
const roomTimers = new Map();
const idleTimers = new Map();
const removalTimers = new Map();

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: true, credentials: true }));
app.get(['/health', '/kitchen-clash/health'], (_request, response) => response.json({ status: 'ok', game: 'kitchen-clash' }));

function newRoomCode() {
  let code;
  do code = Array.from({ length: 6 }, () => ROOM_CODE_ALPHABET[crypto.randomInt(ROOM_CODE_ALPHABET.length)]).join('');
  while (rooms.has(code));
  return code;
}

function cleanName(value) {
  if (typeof value !== 'string') return null;
  const name = value.normalize('NFKC').trim().replace(/\s+/g, ' ');
  return name.length >= 1 && name.length <= 16 && !/[\u0000-\u001F\u007F]/.test(name) ? name : null;
}

function emitState(room) {
  const time = now();
  room.players.forEach((player) => {
    if (player.connected && !player.left) io.to(player.id).emit('state', room.stateFor(player.id, time));
  });
}

function clearRoomTimer(code) {
  clearTimeout(roomTimers.get(code));
  roomTimers.delete(code);
}

// Restarts the no-match timer whenever a new round opens.
function syncIdleTimer(room) {
  clearTimeout(idleTimers.get(room.roomCode));
  idleTimers.delete(room.roomCode);
  if (room.phase !== 'playing') return;
  idleTimers.set(room.roomCode, setTimeout(() => {
    idleTimers.delete(room.roomCode);
    // A claim being settled opens the next round, which restarts this timer.
    if (!room.refreshRound(now())) return;
    emitState(room);
    syncIdleTimer(room);
  }, Math.max(0, room.roundEndsAt - now())));
}

function deleteRoom(room) {
  clearRoomTimer(room.roomCode);
  clearTimeout(idleTimers.get(room.roomCode));
  idleTimers.delete(room.roomCode);
  room.players.forEach((player) => clearRemoval(room.roomCode, player.sessionToken));
  rooms.delete(room.roomCode);
}

const removalKey = (code, token) => `${code}:${token}`;
function clearRemoval(code, token) {
  const key = removalKey(code, token);
  clearTimeout(removalTimers.get(key));
  removalTimers.delete(key);
}

function startCountdown(room, countdownMs) {
  clearRoomTimer(room.roomCode);
  emitState(room);
  roomTimers.set(room.roomCode, setTimeout(() => {
    roomTimers.delete(room.roomCode);
    if (room.beginPlay(now())) emitState(room);
    syncIdleTimer(room);
  }, countdownMs));
}

function afterDeparture(room) {
  if (room.isEmpty()) return deleteRoom(room);
  if (room.phase === 'finished') clearRoomTimer(room.roomCode);
  syncIdleTimer(room);
  emitState(room);
}

function currentRoom(socket) {
  return socket.data.roomCode ? rooms.get(socket.data.roomCode) : null;
}

function seat(socket, room, player) {
  socket.join(room.roomCode);
  socket.data.roomCode = room.roomCode;
  socket.data.sessionToken = player.sessionToken;
  socket.emit('session', { roomCode: room.roomCode, sessionToken: player.sessionToken, name: player.name });
  emitState(room);
}

io.on('connection', (socket) => {
  // App-level round trip measurement, used to check reported reaction times
  // and to size the window that waits for slower claims.
  const pingTimer = setInterval(() => {
    const room = currentRoom(socket);
    if (!room || room.phase === 'lobby') return;
    const sentAt = now();
    socket.timeout(5_000).emit('kc_ping', (error) => {
      if (!error) room.recordRtt(socket.id, now() - sentAt);
    });
  }, PING_INTERVAL_MS);

  socket.on('create_room', ({ name } = {}) => {
    const playerName = cleanName(name);
    if (!playerName) return socket.emit('error_message', 'Please enter a name of up to 16 letters.');
    const room = new KitchenClashGame(newRoomCode(), { roundIdleMs: Number(process.env.ROUND_IDLE_MS) || undefined });
    rooms.set(room.roomCode, room);
    seat(socket, room, room.addPlayer(socket.id, playerName).player);
  });

  socket.on('join_room', ({ roomCode, name } = {}) => {
    const code = typeof roomCode === 'string' ? roomCode.trim().toUpperCase() : '';
    const room = rooms.get(code);
    const playerName = cleanName(name);
    if (!playerName) return socket.emit('error_message', 'Please enter a name of up to 16 letters.');
    if (!room) return socket.emit('error_message', 'We could not find that room. Check the code and try again.');
    const { player, error } = room.addPlayer(socket.id, playerName);
    if (error) return socket.emit('error_message', error);
    seat(socket, room, player);
  });

  socket.on('reconnect_room', ({ roomCode, sessionToken } = {}) => {
    const room = rooms.get(typeof roomCode === 'string' ? roomCode.toUpperCase() : '');
    const player = room && typeof sessionToken === 'string' ? room.reconnectPlayer(sessionToken, socket.id) : null;
    if (!player) return socket.emit('session_invalid');
    clearRemoval(room.roomCode, player.sessionToken);
    seat(socket, room, player);
  });

  socket.on('start_game', () => {
    const room = currentRoom(socket);
    if (!room) return;
    const { error, countdownMs } = room.start(socket.id, now());
    if (error) return socket.emit('error_message', error);
    startCountdown(room, countdownMs);
  });

  socket.on('claim', (payload, acknowledge) => {
    const reply = typeof acknowledge === 'function' ? acknowledge : () => {};
    const room = currentRoom(socket);
    if (!room || typeof payload !== 'object' || payload === null) return reply({ result: 'not_playing' });
    const outcome = room.claim(socket.id, payload, now());
    reply(outcome);
    if (outcome.settleMs !== undefined) {
      clearRoomTimer(room.roomCode);
      roomTimers.set(room.roomCode, setTimeout(() => {
        roomTimers.delete(room.roomCode);
        if (room.settle(now())) emitState(room);
        syncIdleTimer(room);
      }, outcome.settleMs));
    }
  });

  socket.on('leave_room', (acknowledge) => {
    const room = currentRoom(socket);
    const token = socket.data.sessionToken;
    socket.data.roomCode = null;
    if (room) {
      socket.leave(room.roomCode);
      clearRemoval(room.roomCode, token);
      if (room.removePlayer(token)) afterDeparture(room);
    }
    if (typeof acknowledge === 'function') acknowledge({ ok: true });
  });

  socket.on('disconnect', () => {
    clearInterval(pingTimer);
    const room = currentRoom(socket);
    const token = socket.data.sessionToken;
    if (!room) return;
    const graceMs = room.phase === 'countdown' || room.phase === 'playing' ? ACTIVE_GAME_RECONNECT_MS : WAITING_RECONNECT_MS;
    const player = room.disconnectPlayer(socket.id, now(), graceMs);
    if (!player) return;
    // The game carries on without them. Their seat and pile wait for the
    // return window; after that they are removed.
    emitState(room);
    clearRemoval(room.roomCode, token);
    const key = removalKey(room.roomCode, token);
    removalTimers.set(key, setTimeout(() => {
      removalTimers.delete(key);
      const seated = room.players.find((item) => item.sessionToken === token);
      if (!rooms.has(room.roomCode) || !seated || seated.connected) return;
      if (room.removePlayer(token)) afterDeparture(room);
    }, graceMs));
  });
});

const clientDist = path.join(__dirname, '../client/dist');
app.get('/', (_request, response) => response.redirect(302, '/kitchen-clash/'));
app.get(/^\/kitchen-clash$/, (_request, response) => response.redirect(308, '/kitchen-clash/'));
app.use('/kitchen-clash', express.static(clientDist));
app.get('/kitchen-clash/*', (_request, response) => response.sendFile(path.join(clientDist, 'index.html')));

if (require.main === module) server.listen(PORT, HOST, () => console.log(`Kitchen Clash listening on http://${HOST}:${PORT}`));

module.exports = { app, server, io, rooms };
