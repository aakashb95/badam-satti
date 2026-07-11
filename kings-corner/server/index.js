const path = require('path');
const http = require('http');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const { Server } = require('socket.io');
const { KingsCornerGame } = require('./game');

const PORT = Number(process.env.PORT || 5100);
const HOST = process.env.HOST || '0.0.0.0';
const AUTO_ACTION_MS = Number(process.env.AUTO_ACTION_MS || 10_000);
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: true, credentials: true }, pingTimeout: 120_000 });
const rooms = new Map();
const roomTimers = new Map();

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: true, credentials: true }));
app.get('/health', (_request, response) => response.json({ status: 'ok', game: 'kings-corner' }));

function roomCode() {
  let code;
  do code = Math.random().toString(36).slice(2, 8).toUpperCase(); while (rooms.has(code));
  return code;
}

function emitState(room) {
  room.players.forEach((player) => io.to(player.id).emit('state', room.publicState(player.id)));
}

function scheduleAutoAction(room) {
  clearTimeout(roomTimers.get(room.roomCode));
  if (!room.started || room.finished) return;
  room.actionDeadline = Date.now() + AUTO_ACTION_MS;
  emitState(room);
  roomTimers.set(room.roomCode, setTimeout(() => {
    room.performAutoAction();
    emitState(room);
    scheduleAutoAction(room);
  }, AUTO_ACTION_MS));
}

function currentRoom(socket) {
  return socket.data.roomCode ? rooms.get(socket.data.roomCode) : null;
}

function cleanName(value) {
  if (typeof value !== 'string') return null;
  const name = value.trim().replace(/\s+/g, ' ');
  return name.length >= 1 && name.length <= 20 ? name : null;
}

function act(socket, callback) {
  const room = currentRoom(socket);
  if (!room || !room.started || room.finished) return socket.emit('error_message', 'This game is not available.');
  const worked = callback(room);
  if (!worked) return socket.emit('error_message', 'That move is no longer available.');
  emitState(room);
  scheduleAutoAction(room);
}

io.on('connection', (socket) => {
  socket.on('create_room', ({ name } = {}) => {
    const playerName = cleanName(name);
    if (!playerName) return socket.emit('error_message', 'Enter a name between 1 and 20 characters.');
    const code = roomCode();
    const room = new KingsCornerGame(code);
    const player = room.addPlayer(socket.id, playerName);
    rooms.set(code, room);
    socket.join(code);
    socket.data.roomCode = code;
    socket.emit('session', { roomCode: code, sessionToken: player.sessionToken, name: player.name });
    emitState(room);
  });

  socket.on('join_room', ({ roomCode: rawCode, name } = {}) => {
    const code = typeof rawCode === 'string' ? rawCode.trim().toUpperCase() : '';
    const room = rooms.get(code);
    const playerName = cleanName(name);
    if (!room || !playerName) return socket.emit('error_message', 'Check the room code and your name.');
    const player = room.addPlayer(socket.id, playerName);
    if (!player) return socket.emit('error_message', 'The room is full, started, or that name is taken.');
    socket.join(code);
    socket.data.roomCode = code;
    socket.emit('session', { roomCode: code, sessionToken: player.sessionToken, name: player.name });
    emitState(room);
  });

  socket.on('reconnect_room', ({ roomCode: rawCode, sessionToken } = {}) => {
    const code = typeof rawCode === 'string' ? rawCode.trim().toUpperCase() : '';
    const room = rooms.get(code);
    const player = room?.reconnectPlayer(sessionToken, socket.id);
    if (!player) return socket.emit('session_invalid');
    socket.join(code);
    socket.data.roomCode = code;
    socket.emit('session', { roomCode: code, sessionToken: player.sessionToken, name: player.name });
    emitState(room);
  });

  socket.on('start_game', () => {
    const room = currentRoom(socket);
    if (!room?.start(socket.id)) return socket.emit('error_message', 'Only the host can start with 2–4 players.');
    emitState(room);
    scheduleAutoAction(room);
  });
  socket.on('play_card', ({ card, targetPileId } = {}) => act(socket, (room) => room.playCard(socket.id, card, targetPileId)));
  socket.on('move_pile', ({ sourcePileId, targetPileId } = {}) => act(socket, (room) => room.movePile(socket.id, sourcePileId, targetPileId)));
  socket.on('end_turn', () => act(socket, (room) => room.endTurn(socket.id)));

  socket.on('disconnect', () => {
    const room = currentRoom(socket);
    room?.disconnectPlayer(socket.id);
    if (room) emitState(room);
  });
});

const clientDist = path.join(__dirname, '../client/dist');
app.use(express.static(clientDist));
app.get('*', (_request, response) => response.sendFile(path.join(clientDist, 'index.html')));

if (require.main === module) server.listen(PORT, HOST, () => console.log(`King's Corner listening on http://${HOST}:${PORT}`));

module.exports = { app, server, io, rooms, scheduleAutoAction };
