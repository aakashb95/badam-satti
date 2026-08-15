const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const crypto = require("crypto");
const httpProxy = require("http-proxy");
const os = require("os");
const app = express();
const server = require("http").createServer(app);
const KINGS_CORNER_ORIGIN = process.env.KINGS_CORNER_ORIGIN || "http://127.0.0.1:5100";
const kingsCornerProxy = httpProxy.createProxyServer({
  target: KINGS_CORNER_ORIGIN,
  ws: true,
  xfwd: true,
});

// Security configuration
const DEFAULT_ALLOWED_ORIGINS = [
  "http://localhost:3000",
  "https://localhost:3000",
  "http://localhost:5173", // Vite dev server
  "https://localhost:5173",
  "http://localhost:5001", // V2 local client
  "https://localhost:5001",
  "https://games.aakashb.xyz",
  "https://badam7.aakashb.xyz",
  "https://www.badam7.aakashb.xyz"
];
const EXTRA_ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const ALLOWED_ORIGINS = [...new Set([...DEFAULT_ALLOWED_ORIGINS, ...EXTRA_ALLOWED_ORIGINS])];

function isAllowedOrigin(origin) {
  if (!origin) return true;
  if (ALLOWED_ORIGINS.includes(origin)) return true;

  try {
    const { hostname, protocol } = new URL(origin);
    const isLocalProtocol = protocol === 'http:' || protocol === 'https:';
    const isLoopback =
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '::1' ||
      hostname === '[::1]';
    const isPrivateIPv4 =
      /^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
      /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
      /^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(hostname);
    return isLocalProtocol && (isLoopback || isPrivateIPv4);
  } catch {
    return false;
  }
}

const corsOrigin = (origin, callback) => {
  callback(isAllowedOrigin(origin) ? null : new Error('Origin not allowed'), isAllowedOrigin(origin));
};

function getLANAddress() {
  const interfaces = os.networkInterfaces();
  for (const addresses of Object.values(interfaces)) {
    const address = addresses?.find((item) => item.family === 'IPv4' && !item.internal);
    if (address) return address.address;
  }
  return null;
}

const io = require("socket.io")(server, {
  cors: {
    origin: corsOrigin,
    methods: ["GET", "POST"],
    credentials: true
  },
  pingTimeout: 120000,  // 2 minutes - allow for mobile app switching
  pingInterval: 30000,  // 30 seconds - more lenient for mobile
});
const path = require("path");

const { GameRoom, getBotTurnDelayMs, TURN_DURATION_OPTIONS, MIN_PLAYERS } = require("./gameLogic");
const { activeReconnectCutoffMs } = require("./connectionPolicy");
const Database = require("./database");
const IP_HASH_SALT = process.env.IP_HASH_SALT || crypto.randomBytes(32).toString('hex');
const ROOM_CODE_PATTERN = /^[A-Z0-9]{6}$/;
const CARD_SUITS = new Set(['hearts', 'diamonds', 'clubs', 'spades']);
const RATE_LIMITED_EVENTS = new Set(['create_room', 'create_single_player_game', 'join_room', 'reconnect_to_room', 'start_game', 'play_card', 'pass_turn', 'continue_round', 'exit_game', 'leave_room', 'set_turn_duration']);
// Deterministic e2e runs need turns to sit still unless a test opts in.
const TURN_TIMERS_ENABLED = process.env.NODE_ENV !== 'test' || process.env.ENABLE_TURN_TIMERS === '1';
const configuredActiveGameReconnectMs = Number(process.env.ACTIVE_GAME_RECONNECT_MS);
const ACTIVE_GAME_RECONNECT_MS = Number.isFinite(configuredActiveGameReconnectMs) && configuredActiveGameReconnectMs >= 0
  ? configuredActiveGameReconnectMs
  : 60000;
const ACTIVE_GAME_RECONNECT_CUTOFF_MS = activeReconnectCutoffMs(ACTIVE_GAME_RECONNECT_MS);

function hashIP(ip) {
  return crypto.createHash('sha256').update(`${ip}${IP_HASH_SALT}`).digest('hex').substring(0, 16);
}

function isPrivateOrLoopbackAddress(address) {
  if (typeof address !== 'string' || !address) return false;
  const host = address.replace(/^::ffff:/i, '');
  if (host === '::1' || host === '[::1]' || host === 'localhost') return true;
  return (
    /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host) ||
    /^192\.168\.\d{1,3}\.\d{1,3}$/.test(host) ||
    /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host) ||
    /^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(host)
  );
}

// Rate limiting must see the real client, not the reverse proxy. Trust
// x-forwarded-for only when the direct peer is the proxy itself
// (loopback/private), mirroring the origin trust rules above.
function getClientAddress(socket) {
  const direct = socket.handshake.address || '';
  if (isPrivateOrLoopbackAddress(direct)) {
    const forwarded = socket.handshake.headers['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.trim()) {
      const first = forwarded.split(',')[0].trim();
      if (first) return first;
    }
  }
  return direct || 'unknown';
}

function normalizeUsername(value) {
  if (typeof value !== 'string') return null;
  const username = value.normalize('NFKC').trim().replace(/\s+/g, ' ');
  if (!username || username.length > 20 || /[\u0000-\u001F\u007F]/.test(username)) return null;
  return username;
}

function normalizeRoomCode(value) {
  if (typeof value !== 'string') return null;
  const roomCode = value.trim().toUpperCase();
  return ROOM_CODE_PATTERN.test(roomCode) ? roomCode : null;
}

function normalizeSessionToken(value) {
  if (typeof value !== 'string') return null;
  const token = value.trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(token)
    ? token
    : null;
}

function isValidCard(card) {
  return card && typeof card === 'object' && CARD_SUITS.has(card.suit) && Number.isInteger(card.rank) && card.rank >= 1 && card.rank <= 13;
}

function secureKeyMatch(value, secret) {
  if (typeof value !== 'string' || typeof secret !== 'string') return false;
  const candidate = Buffer.from(value);
  const expected = Buffer.from(secret);
  return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
}

function sessionTokenMatches(player, token) {
  return Boolean(
    player &&
    token &&
    typeof player.sessionToken === 'string' &&
    secureKeyMatch(token, player.sessionToken)
  );
}

function sanitizeError(error) {
  // Remove sensitive information from error messages
  if (typeof error === 'string') {
    return error.replace(/\/[^\s]+/g, '[PATH]').replace(/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/g, '[IP]');
  }
  return 'Internal server error';
}

function emitSocketError(socket, code, message) {
  console.warn(`Socket action rejected: ${code} for ${socket.id}`);
  socket.emit("error", { code, message });
}

function emitEndedRoomRecovery(socket) {
  emitSocketError(socket, "ROOM_NOT_FOUND", "Room not found");
  // Clients that were already open before the tab recovery fix understand
  // game_abandoned, so this second event also releases them from stale rooms.
  socket.emit("game_abandoned", {
    message: "This game has ended.",
    recoveryFailure: true,
  });
}

// Room validation and restoration utility
async function ensureRoomExists(roomCode) {
  // If room exists in memory, return it
  if (rooms[roomCode]) {
    return rooms[roomCode];
  }

  // Try to restore room from database
  try {
    console.log(`Attempting to restore room ${roomCode} from database`);
    const dbRoom = await db.getGameRoom(roomCode);
    
    if (dbRoom && dbRoom.is_active) {
      // Recreate room in memory from stored game state
      const room = new GameRoom(roomCode);
      const storedState = dbRoom.game_state;
      
      // Restore all properties from stored state
      Object.assign(room, storedState);
      room.playHistory = Array.isArray(storedState.playHistory) ? storedState.playHistory : [];
      room.historySequence = Number.isInteger(storedState.historySequence) ? storedState.historySequence : room.playHistory.length;
      room.roundResult = storedState.roundResult || null;
      room.dealStartPlayerIndex = Number.isInteger(storedState.dealStartPlayerIndex)
        ? storedState.dealStartPlayerIndex
        : ((storedState.dealerIndex || 0) + 1) % Math.max(1, storedState.players?.length || 1);
      
      // The serialized game state is the source of truth for hands, scores,
      // turn order, and dealer state. The players table only tracks connection
      // metadata for reconnection windows.
      const players = await db.getPlayersInRoom(roomCode);
      const playerRowsByName = new Map(players.map((player) => [player.username, player]));

      room.players = (storedState.players || []).map((player) => {
        const row = playerRowsByName.get(player.name);
        return {
          ...player,
          dealtCardCount: player.dealtCardCount ?? player.cards?.length ?? 0,
          id: row?.socket_id || player.id,
          connected: row ? Boolean(row.connected) : Boolean(player.connected),
          sessionToken: normalizeSessionToken(player.sessionToken) || crypto.randomUUID(),
        };
      });
      if (room.gameFinished && !room.roundResult) {
        room.roundResult = room.buildRoundResult();
      }

      room.playerScores = {};
      room.players.forEach((player) => {
        room.playerScores[player.id] = player.totalScore || 0;
      });
      
      // Validate current player index
      if (room.currentPlayerIndex >= room.players.length) {
        room.currentPlayerIndex = 0;
      }
      
      // Validate dealer index  
      if (room.dealerIndex >= room.players.length) {
        room.dealerIndex = 0;
      }
      
      // Add to memory cache
      rooms[roomCode] = room;
      console.log(`Successfully restored room ${roomCode} with ${room.players.length} players`);

      // Timers are not persisted; give the current player a fresh turn
      // window so a restored game advances instead of hanging forever.
      if (room.started && !room.gameFinished) {
        room.markTurnStarted();
        scheduleTurnTimer(roomCode);
      }
      return room;
    }
  } catch (error) {
    console.error(`Failed to restore room ${roomCode} from database:`, error);
  }
  
  return null;
}

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "wss:", "ws:"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
      upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null
    }
  },
  hsts: process.env.NODE_ENV === 'production',
  crossOriginEmbedderPolicy: false // Allow for PWA features
}));

app.use(cors({
  origin: corsOrigin,
  credentials: true,
  optionsSuccessStatus: 200
}));

function isLoopbackHost(hostname) {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname === '[::1]';
}

// HTTPS enforcement for public production traffic.
// Local loopback traffic is used by PM2/Caddy health checks and must not redirect.
app.use((req, res, next) => {
  if (req.header('x-forwarded-proto') !== 'https' &&
      !isLoopbackHost(req.hostname) &&
      process.env.NODE_ENV === 'production') {
    return res.redirect(`https://${req.hostname}${req.url}`);
  }
  next();
});

// Keep King's Corner reachable behind older catch-all reverse-proxy configs.
// A path-aware Caddy rule may route these requests directly to port 5100, but
// forwarding here makes a normal application deploy sufficient on its own.
app.use((req, res, next) => {
  if (!req.path.startsWith('/kings-corner')) return next();

  kingsCornerProxy.web(req, res, (error) => {
    console.error('King\'s Corner proxy error:', sanitizeError(error.message));
    if (!res.headersSent) {
      res.status(502).type('text/plain').send('King\'s Corner is temporarily unavailable.');
    } else {
      res.end();
    }
  });
});

server.prependListener('upgrade', (req, socket, head) => {
  const pathname = new URL(req.url || '/', 'http://localhost').pathname;
  if (!pathname.startsWith('/kings-corner/socket.io')) return;

  kingsCornerProxy.ws(req, socket, head, (error) => {
    console.error('King\'s Corner WebSocket proxy error:', sanitizeError(error.message));
    socket.destroy();
  });
});

// Initialize database
const db = new Database();

// Store all game rooms (in-memory cache + database persistence)
const rooms = {};
const activeDisconnectTimers = new Map();

if (process.env.NODE_ENV === 'test') {
  app.post('/__test__/rooms/:roomCode/board-run', async (req, res) => {
    const roomCode = normalizeRoomCode(req.params.roomCode);
    const room = roomCode ? await ensureRoomExists(roomCode) : null;
    if (!room || !room.started) {
      res.status(404).json({ error: 'Active test room not found' });
      return;
    }

    const highestRank = Math.min(13, Math.max(7, Number(req.query.highest) || 13));
    const includeSix = req.query.includeSix !== '0';
    const stackedSuit = () => ({
      up: Array.from({ length: highestRank - 6 }, (_, index) => index + 7),
      down: includeSix ? [6] : [],
    });
    room.board = {
      hearts: stackedSuit(),
      diamonds: stackedSuit(),
      clubs: stackedSuit(),
      spades: stackedSuit(),
    };

    io.to(roomCode).emit('card_played', {
      playerName: 'Layout test',
      card: { suit: 'hearts', rank: highestRank },
      gameState: room.getState(),
    });
    res.json({ ok: true, highestRank, includeSix });
  });

  app.post('/__test__/rooms/:roomCode/hand-layout', async (req, res) => {
    const roomCode = normalizeRoomCode(req.params.roomCode);
    const room = roomCode ? await ensureRoomExists(roomCode) : null;
    if (!room || !room.started) {
      res.status(404).json({ error: 'Active test room not found' });
      return;
    }

    const playerName = typeof req.query.player === 'string' ? req.query.player : room.players[0]?.name;
    const playerIndex = room.players.findIndex((player) => player.name === playerName);
    if (playerIndex < 0) {
      res.status(404).json({ error: 'Test player not found' });
      return;
    }

    const thirteenCardHand = [
      { suit: 'hearts', rank: 2 }, { suit: 'hearts', rank: 6 }, { suit: 'hearts', rank: 8 }, { suit: 'hearts', rank: 12 },
      { suit: 'diamonds', rank: 3 }, { suit: 'diamonds', rank: 6 }, { suit: 'diamonds', rank: 8 },
      { suit: 'clubs', rank: 4 }, { suit: 'clubs', rank: 6 }, { suit: 'clubs', rank: 8 },
      { suit: 'spades', rank: 5 }, { suit: 'spades', rank: 6 }, { suit: 'spades', rank: 8 },
    ];
    const eighteenCardHand = [
      { suit: 'hearts', rank: 2 }, { suit: 'hearts', rank: 4 }, { suit: 'hearts', rank: 6 }, { suit: 'hearts', rank: 8 }, { suit: 'hearts', rank: 10 },
      { suit: 'diamonds', rank: 1 }, { suit: 'diamonds', rank: 3 }, { suit: 'diamonds', rank: 6 }, { suit: 'diamonds', rank: 8 },
      { suit: 'clubs', rank: 2 }, { suit: 'clubs', rank: 4 }, { suit: 'clubs', rank: 6 }, { suit: 'clubs', rank: 8 }, { suit: 'clubs', rank: 12 },
      { suit: 'spades', rank: 3 }, { suit: 'spades', rank: 6 }, { suit: 'spades', rank: 8 }, { suit: 'spades', rank: 13 },
    ];
    const criticalHand = [
      { suit: 'hearts', rank: 6 },
      { suit: 'diamonds', rank: 6 },
      { suit: 'clubs', rank: 6 },
      { suit: 'spades', rank: 6 },
    ];
    const cards = req.query.critical === '1'
      ? criticalHand
      : Number(req.query.count) === 18 ? eighteenCardHand : thirteenCardHand;
    const player = room.players[playerIndex];

    player.cards = cards;
    player.dealtCardCount = cards.length;
    room.currentPlayerIndex = playerIndex;
    room.board = {
      hearts: { up: [7], down: [] },
      diamonds: { up: [7], down: [] },
      clubs: { up: [7], down: [] },
      spades: { up: [7], down: [] },
    };

    io.to(roomCode).emit('card_played', {
      playerName: 'Layout test',
      card: { suit: 'hearts', rank: 7 },
      gameState: room.getState(),
    });
    io.to(player.id).emit('your_cards', {
      cards: room.getPlayerCards(player.id),
      validMoves: room.getValidMoves(player.id),
      canPass: room.getPlayerState(player.id).canPass,
    });
    res.json({ ok: true, playerName: player.name, cardCount: cards.length });
  });

  app.post('/__test__/rooms/:roomCode/finish-round', async (req, res) => {
    const roomCode = normalizeRoomCode(req.params.roomCode);
    const room = roomCode ? await ensureRoomExists(roomCode) : null;
    if (!room || !room.started || room.gameFinished || room.players.length < MIN_PLAYERS) {
      res.status(404).json({ error: 'Active test room not found' });
      return;
    }

    const winner = room.players[0];
    winner.cards = [];
    room.players.slice(1).forEach((player, index) => {
      player.cards = [{ suit: index % 2 === 0 ? 'spades' : 'clubs', rank: 13 - index }];
    });
    room.finishGame();
    await db.saveGameRoom(roomCode, room);
    clearTurnTimer(roomCode);

    io.to(roomCode).emit('turn_passed', {
      playerName: winner.name,
      gameState: room.getState(),
    });
    io.to(roomCode).emit('game_over', room.getWinner());
    res.json({ ok: true, winner: winner.name });
  });
}

// Server-authoritative turn timers: one per room, restarted whenever the
// turn advances. The server plays for absent players so a locked phone
// never stalls the table.
const activeTurnTimers = new Map();

function clearTurnTimer(roomCode) {
  const timer = activeTurnTimers.get(roomCode);
  if (!timer) return;
  clearTimeout(timer);
  activeTurnTimers.delete(roomCode);
}

function scheduleTurnTimer(roomCode) {
  clearTurnTimer(roomCode);
  if (!TURN_TIMERS_ENABLED) return;

  const room = rooms[roomCode];
  if (!room || !room.started || room.gameFinished || !room.hasMinimumSeatedPlayers()) return;

  // Small grace period so a human tap at the buzzer beats the server.
  const currentPlayer = room.players[room.currentPlayerIndex];
  const testDelayMs = process.env.NODE_ENV === 'test' ? Number(process.env.TURN_TIMER_TEST_DELAY_MS) : NaN;
  const delayMs = currentPlayer?.isBot
    ? getBotTurnDelayMs(process.env.BOT_TURN_DELAY_MS)
    : Number.isFinite(testDelayMs) && testDelayMs > 0
      ? testDelayMs
      : (room.turnDurationSeconds || 20) * 1000 + 1000;
  const expectedTurnStartedAt = room.turnStartedAt;
  const timer = setTimeout(() => {
    activeTurnTimers.delete(roomCode);
    runServerAutoPlay(roomCode, expectedTurnStartedAt).catch((error) =>
      console.error(`Error auto-playing turn in ${roomCode}:`, error)
    );
  }, delayMs);
  activeTurnTimers.set(roomCode, timer);
}

function pickAutoPlayCard(validMoves) {
  // Shed the card farthest from 7 first: it is the hardest to get rid of.
  return validMoves.reduce(
    (best, card) => (Math.abs(card.rank - 7) > Math.abs(best.rank - 7) ? card : best),
    validMoves[0]
  );
}

async function runServerAutoPlay(roomCode, expectedTurnStartedAt) {
  const room = rooms[roomCode];
  if (!room || !room.started || room.gameFinished || !room.hasMinimumSeatedPlayers()) return;
  // A real move landed while this callback was queued; its handler already
  // rescheduled the timer for the new turn.
  if (expectedTurnStartedAt && room.turnStartedAt !== expectedTurnStartedAt) return;

  const player = room.players[room.currentPlayerIndex];
  if (!player) return;

  const validMoves = room.getValidMoves(player.id);
  if (validMoves.length > 0) {
    const card = player.isBot
      ? room.chooseBotCard(player.id, validMoves)
      : pickAutoPlayCard(validMoves);
    if (!room.playCard(player.id, card, true)) {
      scheduleTurnTimer(roomCode);
      return;
    }

    console.log(`Timer played ${card.rank} of ${card.suit} for ${player.name} in ${roomCode}`);
    await db.saveGameRoom(roomCode, room);
    io.to(roomCode).emit("card_played", {
      playerName: player.name,
      card,
      automatic: true,
      gameState: room.getState(),
    });
    emitPlayerHands(room);

    if (room.checkWinner()) {
      const winner = room.getWinner();
      console.log(`Game finished in room ${roomCode} (timer play):`, winner.winner);
      await db.saveGameRoom(roomCode, room);
      clearTurnTimer(roomCode);
      io.to(roomCode).emit("game_over", winner);
      return;
    }
  } else {
    if (!room.passTurn(player.id, true)) {
      scheduleTurnTimer(roomCode);
      return;
    }

    console.log(`Timer passed for ${player.name} in ${roomCode}`);
    await db.saveGameRoom(roomCode, room);
    io.to(roomCode).emit("turn_passed", {
      playerName: player.name,
      automatic: true,
      gameState: room.getState(),
    });
    emitPlayerHands(room);
  }

  scheduleTurnTimer(roomCode);
}

function resumeTurnTimerIfReady(roomCode, room) {
  if (!room.started || room.gameFinished || !room.hasMinimumSeatedPlayers()) {
    clearTurnTimer(roomCode);
    return;
  }

  if (!activeTurnTimers.has(roomCode)) {
    scheduleTurnTimer(roomCode);
  }
}

function disconnectTimerKey(roomCode, playerId) {
  return `${roomCode}:${playerId}`;
}

function clearActiveDisconnectTimer(roomCode, playerId) {
  const key = disconnectTimerKey(roomCode, playerId);
  const timer = activeDisconnectTimers.get(key);
  if (!timer) return;
  clearTimeout(timer);
  activeDisconnectTimers.delete(key);
}

function buildGameTotals(room) {
  const totals = room.players
    .map((player) => ({ name: player.name, totalScore: player.totalScore }))
    .sort((a, b) => a.totalScore - b.totalScore);

  return {
    totals,
    winner: totals[0]?.name || "",
    loser: totals[totals.length - 1]?.name || "",
  };
}

function emitPlayerHands(room) {
  room.players.forEach((player) => {
    if (!player.connected) return;
    io.to(player.id).emit("your_cards", {
      cards: room.getPlayerCards(player.id),
      validMoves: room.getValidMoves(player.id),
      canPass: room.getPlayerState(player.id).canPass,
    });
  });
}

function emitGameTotals(roomCode, room) {
  io.to(roomCode).emit("game_totals", buildGameTotals(room));
}

async function removePlayerFromRoom(roomCode, playerId, playerName, options = {}) {
  const {
    redistribute = false,
    notify = true,
    redistributionMessage = `${playerName} was removed. Cards redistributed to continue the game.`,
  } = options;

  const room = await ensureRoomExists(roomCode);
  const player = room?.players.find((candidate) => candidate.id === playerId);
  if (!room || !player) return room || null;

  if (room.mode === 'single-player' && !player.isBot) {
    clearTurnTimer(roomCode);
    room.players.forEach((seat) => clearActiveDisconnectTimer(roomCode, seat.id));
    await db.removePlayerFromRoom(playerId, roomCode);
    await db.deactivateRoom(roomCode);
    io.in(roomCode).socketsLeave(roomCode);
    delete rooms[roomCode];
    return null;
  }

  clearActiveDisconnectTimer(roomCode, playerId);
  const activeGameWouldLoseMinimum =
    room.started &&
    !room.gameFinished &&
    room.players.length - 1 < MIN_PLAYERS;
  room.removePlayer(playerId, redistribute && !activeGameWouldLoseMinimum);
  await db.removePlayerFromRoom(playerId, roomCode);

  if (room.players.length === 0) {
    clearTurnTimer(roomCode);
    await db.deactivateRoom(roomCode);
    delete rooms[roomCode];
    return null;
  }

  if (activeGameWouldLoseMinimum) {
    clearTurnTimer(roomCode);
    await Promise.all(
      room.players.map((remainingPlayer) => db.removePlayerFromRoom(remainingPlayer.id, roomCode))
    );
    await db.deactivateRoom(roomCode);
    io.to(roomCode).emit("game_abandoned", {
      message: "All other players have left",
    });
    io.in(roomCode).socketsLeave(roomCode);
    delete rooms[roomCode];
    return null;
  }

  await db.saveGameRoom(roomCode, room);

  if (redistribute && !activeGameWouldLoseMinimum) {
    io.to(roomCode).emit("cards_redistributed", {
      message: redistributionMessage,
    });
  }

  emitPlayerHands(room);

  if (notify) {
    io.to(roomCode).emit("player_disconnected", {
      playerName,
      gameState: room.getState(),
    });
  }

  // Seats shifted, so the current turn (and its deadline) may have moved.
  if (room.started && !room.gameFinished) {
    scheduleTurnTimer(roomCode);
  } else {
    clearTurnTimer(roomCode);
  }

  return room;
}

async function removeDisconnectedWaitingPlayers(roomCode, room) {
  const disconnectedPlayers = room.players.filter((player) => !player.connected);
  if (disconnectedPlayers.length === 0) return [];

  disconnectedPlayers.forEach((player) => {
    clearActiveDisconnectTimer(roomCode, player.id);
    room.removePlayer(player.id, false);
  });

  await Promise.all(
    disconnectedPlayers.map((player) => db.removePlayerFromRoom(player.id, roomCode))
  );
  await db.saveGameRoom(roomCode, room);

  disconnectedPlayers.forEach((player) => {
    io.to(roomCode).emit("player_disconnected", {
      playerName: player.name,
      gameState: room.getState(),
    });
  });

  return disconnectedPlayers;
}

app.use(express.json({ limit: '16kb' }));

app.get('/api/network-info', (req, res) => {
  const lanAddress = getLANAddress();
  const protocol = req.secure ? 'https' : 'http';
  const port = req.socket.localPort || PORT;
  res.json({
    lanAddress,
    lanOrigin: lanAddress ? `${protocol}://${lanAddress}:${port}` : null
  });
});

// Cleanup interval to remove empty rooms and persist active ones
setInterval(async () => {
  try {
    // Cleanup expired reconnection opportunities
    const cleanedReconnections = await db.cleanupExpiredReconnections();
    if (cleanedReconnections > 0) {
      console.log(`Cleaned up ${cleanedReconnections} expired reconnection opportunities`);
    }
    
    // Cleanup empty rooms from memory (check for reconnectable players)
    for (const roomCode of Object.keys(rooms)) {
      if (rooms[roomCode].isRoomEmpty()) {
        // Check if there are any players who can still reconnect
        const reconnectablePlayers = await db.getReconnectablePlayersInRoom(roomCode);
        
        if (reconnectablePlayers.length === 0) {
          console.log(`Cleaning up empty room: ${roomCode}`);
          clearTurnTimer(roomCode);
          await db.deactivateRoom(roomCode);
          delete rooms[roomCode];
        } else {
          console.log(`Room ${roomCode} empty but has ${reconnectablePlayers.length} reconnectable players`);
          // Persist room to database but keep it in memory
          await db.saveGameRoom(roomCode, rooms[roomCode]);
        }
      } else {
        // Persist active rooms to database
        await db.saveGameRoom(roomCode, rooms[roomCode]);
      }
    }
    
    // Cleanup old database records
    const cleanedRooms = await db.cleanupInactiveRooms(24); // 24 hours
    const cleanedRateLimits = await db.cleanupRateLimits(2); // 2 hours
    
    if (cleanedRooms > 0) {
      console.log(`Cleaned up ${cleanedRooms} old room records from database`);
    }
    if (cleanedRateLimits > 0) {
      console.log(`Cleaned up ${cleanedRateLimits} old rate limit records`);
    }
  } catch (error) {
    console.error('Error during cleanup:', error);
  }
}, 60000); // Clean up every minute

const clientDist = path.join(__dirname, "../client/dist");
const landingDir = path.join(__dirname, "../landing");

// Serve Badam Satti under its stable game prefix. Its Socket.io endpoint remains
// at /socket.io so existing clients and reverse-proxy rules keep working.
app.get(/^\/badam7$/, (req, res) => res.redirect(308, '/badam7/'));
app.use('/badam7', express.static(clientDist, {
  setHeaders: (res, path) => {
    // No cache for HTML files
    if (path.endsWith('.html') || path.endsWith('sw.js')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
    // Vite fingerprints JS and CSS, so these can be cached permanently.
    else if (path.endsWith('.js') || path.endsWith('.css')) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    }
    // Allow caching for images and other assets
    else {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    }
  }
}));

// Secure health check endpoint - minimal information exposure
app.get("/health", async (req, res) => {
  try {
    // Simple health check without exposing sensitive data
    await db.healthCheck();
    
    res.json({
      status: "ok",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Health check error:', sanitizeError(error.message));
    res.status(500).json({
      status: "error",
      timestamp: new Date().toISOString(),
    });
  }
});

// Admin-only detailed health endpoint (requires authentication)
app.get("/health/admin", async (req, res) => {
  try {
    // Check for admin authentication
    const adminKey = req.headers['x-admin-key'];
    if (!secureKeyMatch(adminKey, process.env.ADMIN_KEY)) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    
    const dbHealth = await db.healthCheck();
    const activeRooms = await db.getAllActiveRooms();
    
    res.json({
      status: "ok",
      server: {
        uptime: Math.floor(process.uptime()), // Rounded for less precision
        memory_usage_mb: Math.floor(process.memoryUsage().heapUsed / 1024 / 1024),
        node_env: process.env.NODE_ENV || 'development'
      },
      rooms: {
        active_count: activeRooms.length,
        memory_count: Object.keys(rooms).length
      },
      database: {
        status: dbHealth.database,
        active_rooms: dbHealth.active_rooms
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Admin health check error:', sanitizeError(error.message));
    res.status(500).json({
      status: "error",
      timestamp: new Date().toISOString(),
    });
  }
});


// Socket.io connection handling
io.on("connection", (socket) => {
  console.log(`User connected: ${socket.id}`);

  let currentRoom = null;
  let playerName = null;
  const recentActions = [];

  socket.use(([event], next) => {
    if (!RATE_LIMITED_EVENTS.has(event)) return next();
    const cutoff = Date.now() - 10000;
    while (recentActions[0] < cutoff) recentActions.shift();
    if (recentActions.length >= 40) {
      socket.emit('error', 'Too many actions. Please slow down.');
      return;
    }
    recentActions.push(Date.now());
    next();
  });

  // Create a new room
  socket.on("create_room", async (username) => {
    try {
      const cleanUsername = normalizeUsername(username);
      if (!cleanUsername) {
        socket.emit("error", "Username must be between 1 and 20 characters");
        return;
      }

      // Check rate limit using hashed IP
      const clientIP = hashIP(getClientAddress(socket));
      const rateLimitCheck = await db.checkRateLimit(clientIP, 10, 1);
      if (!rateLimitCheck.allowed) {
        socket.emit("error", "Too many room creation attempts. Please wait.");
        return;
      }

      const roomCode = await generateRoomCode();
      rooms[roomCode] = new GameRoom(roomCode);
      const sessionToken = crypto.randomUUID();

      const success = rooms[roomCode].addPlayer(socket.id, cleanUsername, sessionToken);
      if (!success) {
        socket.emit("error", "Failed to create room");
        return;
      }

      socket.join(roomCode);
      currentRoom = roomCode;
      playerName = cleanUsername;

      // Save to database
      await db.saveGameRoom(roomCode, rooms[roomCode]);
      await db.savePlayer(socket.id, playerName, roomCode, socket.id);

      console.log(`Room created: ${roomCode} by ${playerName}`);
      socket.emit("room_created", {
        roomCode,
        sessionToken,
        gameState: rooms[roomCode].getPlayerState(socket.id),
      });
    } catch (error) {
      console.error("Error creating room:", error);
      socket.emit("error", "Failed to create room");
    }
  });

  socket.on("create_single_player_game", async (payload) => {
    try {
      const cleanUsername = normalizeUsername(
        typeof payload === 'string' ? payload : payload?.username
      );
      if (!cleanUsername) {
        socket.emit("error", "Username must be between 1 and 20 characters");
        return;
      }
      const botCount = typeof payload === 'string' ? 3 : payload?.botCount;
      if (!Number.isInteger(botCount) || botCount < 3 || botCount > 10) {
        emitSocketError(socket, "INVALID_BOT_COUNT", "Choose between 3 and 10 computer players");
        return;
      }

      const clientIP = hashIP(getClientAddress(socket));
      const rateLimitCheck = await db.checkRateLimit(clientIP, 10, 1);
      if (!rateLimitCheck.allowed) {
        socket.emit("error", "Too many game creation attempts. Please wait.");
        return;
      }

      const roomCode = await generateRoomCode();
      const room = new GameRoom(roomCode);
      room.mode = 'single-player';
      const sessionToken = crypto.randomUUID();

      if (!room.addPlayer(socket.id, cleanUsername, sessionToken)) {
        socket.emit("error", "Failed to start practice game");
        return;
      }

      const botNames = ['Meera', 'Kabir', 'Tara', 'Arjun', 'Nisha', 'Rohan', 'Leela', 'Vikram', 'Priya', 'Dev'];
      for (const baseName of botNames.slice(0, botCount)) {
        const name = baseName === cleanUsername ? `${baseName} Bot` : baseName;
        if (!room.addBot(name)) {
          socket.emit("error", "Failed to seat computer players");
          return;
        }
      }

      rooms[roomCode] = room;
      socket.join(roomCode);
      currentRoom = roomCode;
      playerName = cleanUsername;

      if (!room.startGame()) {
        delete rooms[roomCode];
        socket.emit("error", "Failed to start practice game");
        return;
      }

      await db.saveGameRoom(roomCode, room);
      await db.savePlayer(socket.id, playerName, roomCode, socket.id);

      console.log(`Single-player game created: ${roomCode} by ${playerName}`);
      socket.emit("room_created", {
        roomCode,
        sessionToken,
        gameState: room.getState(),
      });
      socket.emit("your_cards", {
        cards: room.getPlayerCards(socket.id),
        validMoves: room.getValidMoves(socket.id),
        canPass: room.getPlayerState(socket.id).canPass,
      });
      scheduleTurnTimer(roomCode);
    } catch (error) {
      console.error("Error creating single-player game:", error);
      socket.emit("error", "Failed to start practice game");
    }
  });

  // Join an existing room
  socket.on("join_room", async (payload) => {
    try {
      const cleanRoomCode = normalizeRoomCode(payload?.roomCode);
      const cleanUsername = normalizeUsername(payload?.username);
      if (!cleanRoomCode || !cleanUsername) {
        emitSocketError(socket, "INVALID_JOIN_DETAILS", "Invalid room code or username");
        return;
      }

      // Check rate limit using hashed IP
      const clientIP = hashIP(getClientAddress(socket));
      const rateLimitCheck = await db.checkRateLimit(clientIP, 20, 1);
      if (!rateLimitCheck.allowed) {
        socket.emit("error", "Too many join attempts. Please wait.");
        return;
      }

      const room = await ensureRoomExists(cleanRoomCode);
      if (!room) {
        emitSocketError(socket, "ROOM_NOT_FOUND", "Room not found");
        return;
      }

      if (room.started) {
        emitSocketError(socket, "GAME_ALREADY_STARTED", "Game already started");
        return;
      }

      // Check if username already exists in room
      // For waiting rooms: only check connected players or those with active reconnection window
      // For active games: check all players (including disconnected, since they may reconnect)
      const existingPlayer = room.players.find((p) => p.name === cleanUsername);
      if (existingPlayer) {
        if (existingPlayer.connected) {
          emitSocketError(socket, "USERNAME_TAKEN", "Username already taken in this room");
          return;
        }

        const reconnectablePlayers = await db.getReconnectablePlayersInRoom(cleanRoomCode);
        const seatIsReserved = reconnectablePlayers.some(
          (candidate) => candidate.username === cleanUsername
        );
        if (seatIsReserved) {
          emitSocketError(
            socket,
            "RECONNECT_REQUIRED",
            "This name has a reserved seat. Reconnect from the original device."
          );
          return;
        }

        console.log(`Cleaning up expired disconnected player: ${cleanUsername} in room ${cleanRoomCode}`);
        room.removePlayer(existingPlayer.id, false);
        await db.removePlayerFromRoom(existingPlayer.id, cleanRoomCode);
      }

      const sessionToken = crypto.randomUUID();
      const success = room.addPlayer(socket.id, cleanUsername, sessionToken);
      if (!success) {
        emitSocketError(socket, "ROOM_FULL", "Room is full");
        return;
      }

      socket.join(cleanRoomCode);
      currentRoom = cleanRoomCode;
      playerName = cleanUsername;

      // Save to database
      await db.saveGameRoom(cleanRoomCode, room);
      await db.savePlayer(socket.id, playerName, cleanRoomCode, socket.id);

      console.log(`${playerName} joined room: ${cleanRoomCode}`);
      socket.emit("room_joined", {
        roomCode: cleanRoomCode,
        sessionToken,
        gameState: room.getPlayerState(socket.id),
      });

      // Notify all players in the room
      io.to(cleanRoomCode).emit("player_joined", {
        playerName: cleanUsername,
        gameState: room.getState(),
      });
    } catch (error) {
      console.error("Error joining room:", error);
      socket.emit("error", "Failed to join room");
    }
  });

  // Attempt to reconnect to a room
  socket.on("reconnect_to_room", async (payload) => {
    try {
      const cleanRoomCode = normalizeRoomCode(payload?.roomCode);
      const cleanUsername = normalizeUsername(payload?.username);
      const cleanSessionToken = normalizeSessionToken(payload?.sessionToken);
      if (!cleanRoomCode || !cleanUsername) {
        emitSocketError(socket, "INVALID_JOIN_DETAILS", "Invalid room code or username");
        return;
      }
      if (!cleanSessionToken) {
        emitSocketError(socket, "RECONNECT_UNAVAILABLE", "A valid session token is required to reconnect");
        return;
      }

      const room = await ensureRoomExists(cleanRoomCode);
      if (!room) {
        emitEndedRoomRecovery(socket);
        return;
      }

      const existingPlayer = room.players.find((p) => p.name === cleanUsername);
      if (!sessionTokenMatches(existingPlayer, cleanSessionToken)) {
        emitSocketError(
          socket,
          "RECONNECT_UNAVAILABLE",
          "Cannot reconnect without the session token for this seat"
        );
        return;
      }

      if (existingPlayer?.connected) {
        if (existingPlayer.id !== socket.id) {
          const previousPlayerId = existingPlayer.id;
          clearActiveDisconnectTimer(cleanRoomCode, previousPlayerId);
          room.reconnectPlayer(previousPlayerId, socket.id, cleanSessionToken);
          await db.updatePlayerSocketId(previousPlayerId, socket.id);
        }

        socket.join(cleanRoomCode);
        currentRoom = cleanRoomCode;
        playerName = cleanUsername;
        await db.saveGameRoom(cleanRoomCode, room);

        socket.emit("room_reconnected", {
          roomCode: cleanRoomCode,
          sessionToken: cleanSessionToken,
          gameState: room.getState(),
          myCards: room.getPlayerCards(socket.id),
          validMoves: room.getValidMoves(socket.id),
          canPass: room.getPlayerState(socket.id).canPass,
        });
        return;
      }

      // Attempt reconnection through database
      const reconnectionResult = await db.attemptPlayerReconnection(
        cleanUsername, 
        cleanRoomCode, 
        socket.id
      );

      if (!reconnectionResult.canReconnect) {
        emitSocketError(socket, "RECONNECT_UNAVAILABLE", "Cannot reconnect - reconnection period expired or you were not in this room");
        return;
      }

      // Update room state
      clearActiveDisconnectTimer(cleanRoomCode, reconnectionResult.playerId);

      const success = room.reconnectPlayer(
        reconnectionResult.playerId,
        socket.id,
        cleanSessionToken
      );

      if (!success) {
        emitSocketError(socket, "RECONNECT_FAILED", "Failed to reconnect to room");
        return;
      }

      socket.join(cleanRoomCode);
      currentRoom = cleanRoomCode;
      playerName = cleanUsername;

      resumeTurnTimerIfReady(cleanRoomCode, room);
      await db.saveGameRoom(cleanRoomCode, room);

      console.log(`${playerName} reconnected to room: ${cleanRoomCode}`);
      
      socket.emit("room_reconnected", {
        roomCode: cleanRoomCode,
        sessionToken: cleanSessionToken,
        gameState: room.getState(),
        myCards: room.getPlayerCards(socket.id),
        validMoves: room.getValidMoves(socket.id),
        canPass: room.getPlayerState(socket.id).canPass,
      });

      // Notify all players in the room
      io.to(cleanRoomCode).emit("player_reconnected", {
        playerName: cleanUsername,
        gameState: room.getState(),
      });

      // Resend every hand because the returning socket has a new player ID.
      emitPlayerHands(room);
    } catch (error) {
      console.error("Error reconnecting to room:", error);
      socket.emit("error", "Failed to reconnect to room");
    }
  });

  // Start the game
  socket.on("start_game", async () => {
    try {
      if (!currentRoom) {
        socket.emit("error", "Not in a valid room");
        return;
      }

      const room = await ensureRoomExists(currentRoom);
      if (!room) {
        socket.emit("error", "Not in a valid room");
        return;
      }

      // Only the first player (room creator) can start the game
      if (room.players[0].id !== socket.id) {
        socket.emit("error", "Only room creator can start the game");
        return;
      }

      await removeDisconnectedWaitingPlayers(currentRoom, room);

      if (room.players.length < MIN_PLAYERS) {
        emitSocketError(socket, "NOT_ENOUGH_CONNECTED_PLAYERS", "Need at least 3 connected players to start");
        return;
      }

      const success = room.startGame();
      if (!success) {
        socket.emit("error", "Failed to start game");
        return;
      }

      // Save game state to database
      await db.saveGameRoom(currentRoom, room);

      console.log(`Game started in room: ${currentRoom}`);
      io.to(currentRoom).emit("game_started", {
        gameState: room.getState(),
      });

      // Send each player their cards
      room.players.forEach((player) => {
        io.to(player.id).emit("your_cards", {
          cards: room.getPlayerCards(player.id),
          validMoves: room.getValidMoves(player.id),
          canPass: room.getPlayerState(player.id).canPass,
        });
      });

      scheduleTurnTimer(currentRoom);
    } catch (error) {
      console.error("Error starting game:", error);
      socket.emit("error", "Failed to start game");
    }
  });

  // Host picks how long each turn lasts, before the game starts
  socket.on("set_turn_duration", async (seconds) => {
    try {
      if (!currentRoom) {
        socket.emit("error", "Not in a valid room");
        return;
      }

      const room = await ensureRoomExists(currentRoom);
      if (!room) {
        socket.emit("error", "Not in a valid room");
        return;
      }

      if (room.players[0]?.id !== socket.id) {
        emitSocketError(socket, "HOST_ONLY", "Only the host can change the turn timer");
        return;
      }

      if (room.started) {
        emitSocketError(socket, "GAME_ALREADY_STARTED", "The turn timer can only be changed before the game starts");
        return;
      }

      if (!TURN_DURATION_OPTIONS.includes(seconds) || !room.setTurnDuration(seconds)) {
        socket.emit("error", "Invalid turn duration");
        return;
      }

      await db.saveGameRoom(currentRoom, room);
      io.to(currentRoom).emit("turn_duration_changed", {
        turnDurationSeconds: seconds,
        gameState: room.getState(),
      });
    } catch (error) {
      console.error("Error setting turn duration:", error);
      socket.emit("error", "Failed to set turn duration");
    }
  });

  // Play a card
  socket.on("play_card", async (card) => {
    try {
      if (!isValidCard(card)) {
        socket.emit("error", "Invalid card");
        return;
      }
      if (!currentRoom) {
        socket.emit("error", "Not in a valid room");
        return;
      }

      const room = await ensureRoomExists(currentRoom);
      if (!room) {
        socket.emit("error", "Not in a valid room");
        return;
      }
      const success = room.playCard(socket.id, card);

      if (!success) {
        socket.emit("error", "Invalid move");
        return;
      }

      console.log(`${playerName} played ${card.rank} of ${card.suit}`);

      // Save game state to database
      await db.saveGameRoom(currentRoom, room);

      // Notify all players about the card played
      io.to(currentRoom).emit("card_played", {
        playerName,
        card,
        gameState: room.getState(),
      });

      // Send updated cards to all players
      room.players.forEach((player) => {
        io.to(player.id).emit("your_cards", {
          cards: room.getPlayerCards(player.id),
          validMoves: room.getValidMoves(player.id),
          canPass: room.getPlayerState(player.id).canPass,
        });
      });

      // Check for winner
      if (room.checkWinner()) {
        // finishGame() is already called in playCard method when someone wins
        const winner = room.getWinner();
        console.log(`Game finished in room ${currentRoom}:`, winner);
        // Save final game state
        await db.saveGameRoom(currentRoom, room);
        clearTurnTimer(currentRoom);
        io.to(currentRoom).emit("game_over", winner);
      } else {
        scheduleTurnTimer(currentRoom);
      }
    } catch (error) {
      console.error("Error playing card:", error);
      socket.emit("error", "Failed to play card");
    }
  });

  // Pass turn
  socket.on("pass_turn", async () => {
    try {
      if (!currentRoom) {
        socket.emit("error", "Not in a valid room");
        return;
      }

      const room = await ensureRoomExists(currentRoom);
      if (!room) {
        socket.emit("error", "Not in a valid room");
        return;
      }
      const success = room.passTurn(socket.id);

      if (!success) {
        socket.emit("error", "Cannot pass - you have valid moves");
        return;
      }

      console.log(`${playerName} passed their turn`);

      // Save game state to database
      await db.saveGameRoom(currentRoom, room);

      // Notify all players about the pass
      io.to(currentRoom).emit("turn_passed", {
        playerName,
        gameState: room.getState(),
      });

      // Send updated valid moves to all players
      room.players.forEach((player) => {
        io.to(player.id).emit("your_cards", {
          cards: room.getPlayerCards(player.id),
          validMoves: room.getValidMoves(player.id),
          canPass: room.getPlayerState(player.id).canPass,
        });
      });

      scheduleTurnTimer(currentRoom);
    } catch (error) {
      console.error("Error passing turn:", error);
      socket.emit("error", "Failed to pass turn");
    }
  });

  // Continue to the next round while keeping cumulative scores
  socket.on("continue_round", async () => {
    try {
      if (!currentRoom) {
        socket.emit("error", "Not in a valid room");
        return;
      }

      const room = await ensureRoomExists(currentRoom);
      if (!room) {
        socket.emit("error", "Not in a valid room");
        return;
      }
      if (!room.gameFinished) {
        // Someone else already continued the round (two players tapping
        // "Next round" together). Sync this player into it, no error popup.
        if (room.started) {
          socket.emit("round_continued", { gameState: room.getState() });
          socket.emit("your_cards", {
            cards: room.getPlayerCards(socket.id),
            validMoves: room.getValidMoves(socket.id),
            canPass: room.getPlayerState(socket.id).canPass,
          });
          return;
        }
        socket.emit("error", "Round not finished yet");
        return;
      }
      if (!room.hasMoreRounds()) {
        clearTurnTimer(currentRoom);
        emitGameTotals(currentRoom, room);
        room.started = false;
        room.gameFinished = true;
        await db.saveGameRoom(currentRoom, room);
        return;
      }
      if (room.players.length < MIN_PLAYERS) {
        emitSocketError(
          socket,
          "NOT_ENOUGH_CONNECTED_PLAYERS",
          "Need at least 3 connected players to start the next round"
        );
        return;
      }
      if (room.players.some((player) => !player.connected)) {
        emitSocketError(
          socket,
          "PLAYERS_RECONNECTING",
          "Wait for disconnected players to reconnect before starting the next round"
        );
        return;
      }

      const success = room.continueRound();
      if (!success) {
        socket.emit("error", "Unable to start next round");
        return;
      }

      // Save game state to database
      await db.saveGameRoom(currentRoom, room);

      io.to(currentRoom).emit("round_continued", {
        gameState: room.getState(),
      });

      emitPlayerHands(room);
      scheduleTurnTimer(currentRoom);
    } catch (error) {
      console.error("Error continuing round:", error);
      socket.emit("error", "Failed to continue round");
    }
  });

  // Exit the game and broadcast cumulative results
  socket.on("exit_game", async () => {
    try {
      if (!currentRoom) {
        socket.emit("error", "Not in a valid room");
        return;
      }

      const room = await ensureRoomExists(currentRoom);
      if (!room) {
        socket.emit("error", "Not in a valid room");
        return;
      }

      // Finishing the game ends it for the whole table, so only the host
      // may do it — same rule as starting the game.
      if (room.players[0]?.id !== socket.id) {
        emitSocketError(socket, "HOST_ONLY", "Only the host can finish the game");
        return;
      }

      clearTurnTimer(currentRoom);
      emitGameTotals(currentRoom, room);

      room.started = false;
      room.gameFinished = true;

      // Save final game state
      await db.saveGameRoom(currentRoom, room);
    } catch (error) {
      console.error("Error exiting game:", error);
      socket.emit("error", "Failed to exit game");
    }
  });

  socket.on("leave_room", async (acknowledge) => {
    if (!currentRoom) {
      socket.emit("left_room");
      if (typeof acknowledge === "function") acknowledge({ ok: true });
      return;
    }

    const leavingRoom = currentRoom;
    const leavingPlayerName = playerName || "A player";
    const leavingPlayerId = socket.id;

    try {
      const room = await ensureRoomExists(leavingRoom);
      const shouldRedistribute = Boolean(room?.started && !room.gameFinished);

      currentRoom = null;
      playerName = null;
      socket.leave(leavingRoom);

      await removePlayerFromRoom(leavingRoom, leavingPlayerId, leavingPlayerName, {
        redistribute: shouldRedistribute,
        redistributionMessage: `${leavingPlayerName} left. Cards redistributed to continue the game.`,
      });

      socket.emit("left_room");
      if (typeof acknowledge === "function") acknowledge({ ok: true });
    } catch (error) {
      console.error("Error leaving room:", error);
      socket.emit("error", "Failed to leave room");
      if (typeof acknowledge === "function") acknowledge({ ok: false });
    }
  });

  // Get current game state
  socket.on("get_state", async () => {
    try {
      if (!currentRoom) {
        emitSocketError(socket, "RECONNECT_UNAVAILABLE", "Your room session is no longer available");
        return;
      }

      const room = await ensureRoomExists(currentRoom);
      if (!room) {
        emitEndedRoomRecovery(socket);
        return;
      }

      if (!room.players.some((player) => player.id === socket.id)) {
        emitSocketError(socket, "RECONNECT_UNAVAILABLE", "Your room session is no longer available");
        return;
      }

      socket.emit("game_state", room.getPlayerState(socket.id));
    } catch (error) {
      console.error("Error getting state:", error);
      socket.emit("error", "Failed to get game state");
    }
  });

  // Handle disconnection
  socket.on("disconnect", async (reason) => {
    console.log(`User disconnected: ${socket.id} (${reason})`);

    try {
      if (currentRoom && rooms[currentRoom]) {
        const room = rooms[currentRoom];
        if (!room.players.some((player) => player.id === socket.id)) {
          return;
        }
        // Only a live round needs the harsh 30s-then-redistribute treatment.
        // On the results screen (gameFinished) there is no turn to hold up,
        // so it gets the same lenient window as the waiting room.
        const inActiveRound = room.started && !room.gameFinished;
        if (inActiveRound) {
          // Active games preserve the seat through the full return window.
          // The extra second makes a return at exactly 60 seconds valid.
          console.log(`Player ${playerName} disconnected during game - allowing ${ACTIVE_GAME_RECONNECT_MS / 1000}s reconnection`);

          room.setPlayerDisconnected(socket.id);

          await db.setPlayerDisconnected(socket.id, true, ACTIVE_GAME_RECONNECT_CUTOFF_MS / 60000);
          await db.saveGameRoom(currentRoom, room);

          io.to(currentRoom).emit("player_temporarily_disconnected", {
            playerName,
            gameState: room.getState(),
            message: `${playerName} disconnected but can reconnect`,
          });

          emitPlayerHands(room);

          const disconnectedRoom = currentRoom;
          const disconnectedPlayerId = socket.id;
          const disconnectedPlayerName = playerName;
          clearActiveDisconnectTimer(disconnectedRoom, disconnectedPlayerId);
          const timer = setTimeout(async () => {
            activeDisconnectTimers.delete(disconnectTimerKey(disconnectedRoom, disconnectedPlayerId));
            try {
              const latestRoom = await ensureRoomExists(disconnectedRoom);
              const player = latestRoom?.players.find((p) => p.id === disconnectedPlayerId);
              if (!latestRoom || !player || player.connected) return;

              console.log(`Reconnection expired for ${disconnectedPlayerName}. Redistributing cards.`);
              await removePlayerFromRoom(disconnectedRoom, disconnectedPlayerId, disconnectedPlayerName, {
                redistribute: true,
              });
            } catch (error) {
              console.error("Error finalizing active disconnect:", error);
            }
          }, ACTIVE_GAME_RECONNECT_CUTOFF_MS);
          activeDisconnectTimers.set(disconnectTimerKey(disconnectedRoom, disconnectedPlayerId), timer);
        } else {
          // Waiting room or results screen - allow a long reconnection window
          console.log(`Player ${playerName} disconnected outside an active round - allowing reconnection`);

          // Mark player as disconnected but don't remove them yet
          room.setPlayerDisconnected(socket.id);

          // Set reconnection opportunity in database (10 minutes)
          await db.setPlayerDisconnected(socket.id, true, 10);
          
          // Save updated game state
          await db.saveGameRoom(currentRoom, room);

          // Broadcast updated state to remaining players
          io.to(currentRoom).emit("player_temporarily_disconnected", {
            playerName,
            gameState: room.getState(),
            message: `${playerName} disconnected but can reconnect`,
          });
        }

        // If the room becomes empty, it will be cleaned up by the interval
      }
    } catch (error) {
      console.error("Error handling disconnect:", error);
    }
  });

  // Intentional disconnects use leave_room; transport drops use phase-aware reconnection windows.
});

// Generate a 6-character room code
async function generateRoomCode() {
  // Avoid ambiguous characters in fresh room codes: 0/O and 1/I are
  // easy to confuse when shared verbally or read from a phone screen.
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

  for (let attempt = 0; attempt < 25; attempt++) {
    let result = "";
    for (let i = 0; i < 6; i++) {
      result += chars.charAt(crypto.randomInt(chars.length));
    }

    if (rooms[result]) continue;

    // Persisted rooms survive restarts, so an active code may exist in the
    // database without being in memory yet.
    const persisted = await db.getGameRoom(result);
    if (persisted && persisted.is_active) continue;

    return result;
  }

  throw new Error("Unable to allocate a unique room code");
}

// Graceful shutdown handling
let isShuttingDown = false;
async function shutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`\n📦 ${signal} received. Shutting down gracefully...`);

  try {
    // Stop pending turn timers so none fire mid-shutdown
    for (const roomCode of activeTurnTimers.keys()) {
      clearTurnTimer(roomCode);
    }

    // Save all active rooms to database
    for (const [roomCode, room] of Object.entries(rooms)) {
      await db.saveGameRoom(roomCode, room);
    }

    // Close live socket connections and the HTTP server before the database.
    await new Promise((resolve) => io.close(resolve));
    await db.close();

    console.log('✅ Server closed gracefully');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error during shutdown:', error);
    process.exit(1);
  }
}

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));

// Preserve shared room links created before the multi-game landing page existed.
app.get('/r/:roomCode', (req, res) => {
  const query = req.originalUrl.includes('?') ? req.originalUrl.slice(req.originalUrl.indexOf('?')) : '';
  res.redirect(308, `/badam7/r/${encodeURIComponent(req.params.roomCode)}${query}`);
});
app.get('/simulation', (req, res) => res.redirect(308, '/badam7/simulation'));

// Badam's BrowserRouter needs an app-shell fallback below its prefix.
app.get("/badam7/*", (req, res) => {
  // Always serve fresh HTML with no-cache headers
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.sendFile(path.join(clientDist, "index.html"));
});

// The domain root is a deliberately small, cache-safe game chooser.
app.use(express.static(landingDir, { index: false, maxAge: '1h' }));
app.get('/', (req, res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.sendFile(path.join(landingDir, 'index.html'));
});

app.use((req, res) => res.status(404).sendFile(path.join(landingDir, '404.html')));

// Start the server
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || "0.0.0.0";
server.listen(PORT, HOST, () => {
  const lanAddress = getLANAddress();
  console.log(`🎮 Badam Satti server running on port ${PORT}`);
  console.log(`📱 Open http://localhost:${PORT} in your browser`);
  if (lanAddress) console.log(`🌐 Phone / same Wi-Fi: http://${lanAddress}:${PORT}`);
  console.log(`📦 SQLite database initialized`);
  console.log(`🛡️  Rate limiting enabled`);
  console.log(`🔄 Game persistence enabled`);
});
