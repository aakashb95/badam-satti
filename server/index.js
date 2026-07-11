const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const crypto = require("crypto");
const os = require("os");
const app = express();
const server = require("http").createServer(app);

// Security configuration
const ALLOWED_ORIGINS = [
  "http://localhost:3000",
  "https://localhost:3000",
  "http://localhost:5173", // Vite dev server
  "https://localhost:5173",
  "http://localhost:5001", // V2 local client
  "https://localhost:5001",
  "https://badam7.aakashb.xyz",
  "https://www.badam7.aakashb.xyz"
];

function isAllowedOrigin(origin) {
  if (!origin) return true;
  if (ALLOWED_ORIGINS.includes(origin)) return true;

  try {
    const { hostname, protocol } = new URL(origin);
    const isLocalProtocol = protocol === 'http:' || protocol === 'https:';
    const isPrivateIPv4 =
      /^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
      /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
      /^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(hostname);
    return isLocalProtocol && isPrivateIPv4;
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

const { GameRoom } = require("./gameLogic");
const Database = require("./database");
const IP_HASH_SALT = process.env.IP_HASH_SALT || crypto.randomBytes(32).toString('hex');
const ROOM_CODE_PATTERN = /^[A-Z0-9]{6}$/;
const CARD_SUITS = new Set(['hearts', 'diamonds', 'clubs', 'spades']);
const RATE_LIMITED_EVENTS = new Set(['create_room', 'join_room', 'reconnect_to_room', 'start_game', 'play_card', 'pass_turn', 'continue_round', 'exit_game']);

function hashIP(ip) {
  return crypto.createHash('sha256').update(`${ip}${IP_HASH_SALT}`).digest('hex').substring(0, 16);
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

function isValidCard(card) {
  return card && typeof card === 'object' && CARD_SUITS.has(card.suit) && Number.isInteger(card.rank) && card.rank >= 1 && card.rank <= 13;
}

function secureKeyMatch(value, secret) {
  if (typeof value !== 'string' || typeof secret !== 'string') return false;
  const candidate = Buffer.from(value);
  const expected = Buffer.from(secret);
  return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
}

function sanitizeError(error) {
  // Remove sensitive information from error messages
  if (typeof error === 'string') {
    return error.replace(/\/[^\s]+/g, '[PATH]').replace(/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/g, '[IP]');
  }
  return 'Internal server error';
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
      
      // Ensure players array is properly structured with current socket connections
      const players = await db.getPlayersInRoom(roomCode);
      room.players = [];
      room.playerScores = {};
      
      players.forEach(player => {
        room.players.push({
          id: player.socket_id,
          name: player.username,
          cards: player.cards ? JSON.parse(player.cards) : [],
          connected: player.connected,
          totalScore: player.total_score || 0
        });
        room.playerScores[player.socket_id] = player.total_score || 0;
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

// HTTPS enforcement (except for localhost development)
app.use((req, res, next) => {
  if (req.header('x-forwarded-proto') !== 'https' && 
      !req.hostname.includes('localhost') && 
      process.env.NODE_ENV === 'production') {
    return res.redirect(`https://${req.hostname}${req.url}`);
  }
  next();
});

// Initialize database
const db = new Database();

// Store all game rooms (in-memory cache + database persistence)
const rooms = {};

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

// Serve static files from client dist directory (React build)
// Add no-cache headers for HTML, JS, CSS to ensure latest UI
app.use(express.static(path.join(__dirname, "../client/dist"), {
  setHeaders: (res, path) => {
    // No cache for HTML files
    if (path.endsWith('.html')) {
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
      const clientIP = hashIP(socket.handshake.address || 'unknown');
      const rateLimitCheck = await db.checkRateLimit(clientIP, 10, 1);
      if (!rateLimitCheck.allowed) {
        socket.emit("error", "Too many room creation attempts. Please wait.");
        return;
      }

      const roomCode = generateRoomCode();
      rooms[roomCode] = new GameRoom(roomCode);

      const success = rooms[roomCode].addPlayer(socket.id, cleanUsername);
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
        gameState: rooms[roomCode].getPlayerState(socket.id),
      });
    } catch (error) {
      console.error("Error creating room:", error);
      socket.emit("error", "Failed to create room");
    }
  });

  // Join an existing room
  socket.on("join_room", async (payload) => {
    try {
      const cleanRoomCode = normalizeRoomCode(payload?.roomCode);
      const cleanUsername = normalizeUsername(payload?.username);
      if (!cleanRoomCode || !cleanUsername) {
        socket.emit("error", "Invalid room code or username");
        return;
      }

      // Check rate limit using hashed IP
      const clientIP = hashIP(socket.handshake.address || 'unknown');
      const rateLimitCheck = await db.checkRateLimit(clientIP, 20, 1);
      if (!rateLimitCheck.allowed) {
        socket.emit("error", "Too many join attempts. Please wait.");
        return;
      }

      if (!rooms[cleanRoomCode]) {
        socket.emit("error", "Room not found");
        return;
      }

      if (rooms[cleanRoomCode].started) {
        socket.emit("error", "Game already started");
        return;
      }

      // Check if username already exists in room
      // For waiting rooms: only check connected players or those with active reconnection window
      // For active games: check all players (including disconnected, since they may reconnect)
      const existingPlayer = rooms[cleanRoomCode].players.find((p) => p.name === cleanUsername);
      if (existingPlayer) {
        const isWaitingRoom = !rooms[cleanRoomCode].started;
        if (isWaitingRoom) {
          // In waiting room: allow joining if previous user was disconnected and cleaned up
          if (existingPlayer.connected) {
            socket.emit("error", "Username already taken in this room");
            return;
          }
          // Check if the disconnected player has an active reconnection window
          try {
            const reconnectionData = await db.getPlayerReconnectionData(cleanUsername, cleanRoomCode);
            if (reconnectionData && reconnectionData.can_reconnect) {
              socket.emit("error", "Username already taken in this room (previous player can still reconnect)");
              return;
            }
            // Clean up the orphaned disconnected player
            console.log(`Cleaning up orphaned disconnected player: ${cleanUsername} in room ${cleanRoomCode}`);
            rooms[cleanRoomCode].removePlayer(existingPlayer.id, false);
            await db.removePlayerFromRoom(existingPlayer.id, cleanRoomCode);
          } catch (error) {
            console.warn(`Failed to check/cleanup reconnection data for ${cleanUsername}:`, error);
          }
        } else {
          // During active game: check if this is a reconnection attempt
          if (!existingPlayer.connected) {
            // This is a disconnected player trying to reconnect during active game
            try {
              const reconnectionData = await db.getPlayerReconnectionData(cleanUsername, cleanRoomCode);
              if (reconnectionData && reconnectionData.can_reconnect) {
                console.log(`Reconnecting player ${cleanUsername} to active game in room ${cleanRoomCode}`);
                
                // Update player connection and socket ID
                existingPlayer.connected = true;
                existingPlayer.id = socket.id;
                
                // Update database
                await db.updatePlayerSocketId(reconnectionData.player_id, socket.id);
                await db.clearPlayerReconnectionData(reconnectionData.player_id);
                
                socket.join(cleanRoomCode);
                currentRoom = cleanRoomCode;
                playerName = cleanUsername;
                
                // Save updated room state
                await db.saveGameRoom(cleanRoomCode, rooms[cleanRoomCode]);
                
                // Send game state to reconnected player
                socket.emit("room_joined", {
                  roomCode: cleanRoomCode,
                  gameState: rooms[cleanRoomCode].getState(),
                });
                
                // Send their cards
                socket.emit("your_cards", {
                  cards: rooms[cleanRoomCode].getPlayerCards(socket.id),
                  validMoves: rooms[cleanRoomCode].getValidMoves(socket.id),
                });
                
                // Broadcast reconnection to other players
                socket.to(cleanRoomCode).emit("player_reconnected", {
                  playerName: cleanUsername,
                  gameState: rooms[cleanRoomCode].getState(),
                });
                
                console.log(`Successfully reconnected ${cleanUsername} to active game in room ${cleanRoomCode}`);
                return;
              } else {
                // Reconnection window has expired - player was likely already removed
                console.log(`Reconnection window expired for ${cleanUsername} in room ${cleanRoomCode}`);
              }
            } catch (error) {
              console.error(`Error during game reconnection for ${cleanUsername}:`, error);
            }
          }
          
          // Username is taken by connected player or reconnection failed
          socket.emit("error", "Username already taken in this room");
          return;
        }
      }

      const success = rooms[cleanRoomCode].addPlayer(socket.id, cleanUsername);
      if (!success) {
        socket.emit("error", "Room is full (max 11 players)");
        return;
      }

      socket.join(cleanRoomCode);
      currentRoom = cleanRoomCode;
      playerName = cleanUsername;

      // Save to database
      await db.saveGameRoom(cleanRoomCode, rooms[cleanRoomCode]);
      await db.savePlayer(socket.id, playerName, cleanRoomCode, socket.id);

      console.log(`${playerName} joined room: ${cleanRoomCode}`);
      socket.emit("room_joined", {
        roomCode: cleanRoomCode,
        gameState: rooms[cleanRoomCode].getPlayerState(socket.id),
      });

      // Notify all players in the room
      io.to(cleanRoomCode).emit("player_joined", {
        playerName: cleanUsername,
        gameState: rooms[cleanRoomCode].getState(),
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
      if (!cleanRoomCode || !cleanUsername) {
        socket.emit("error", "Invalid room code or username");
        return;
      }

      // Check if room exists
      if (!rooms[cleanRoomCode]) {
        socket.emit("error", "Room not found");
        return;
      }

      // Attempt reconnection through database
      const reconnectionResult = await db.attemptPlayerReconnection(
        cleanUsername, 
        cleanRoomCode, 
        socket.id
      );

      if (!reconnectionResult.canReconnect) {
        socket.emit("error", "Cannot reconnect - reconnection period expired or you were not in this room");
        return;
      }

      // Update room state
      const success = rooms[cleanRoomCode].reconnectPlayer(
        reconnectionResult.playerId, 
        socket.id, 
        socket.id
      );

      if (!success) {
        socket.emit("error", "Failed to reconnect to room");
        return;
      }

      socket.join(cleanRoomCode);
      currentRoom = cleanRoomCode;
      playerName = cleanUsername;

      // Save updated game state
      await db.saveGameRoom(cleanRoomCode, rooms[cleanRoomCode]);

      console.log(`${playerName} reconnected to room: ${cleanRoomCode}`);
      
      socket.emit("room_reconnected", {
        roomCode: cleanRoomCode,
        gameState: rooms[cleanRoomCode].getPlayerState(socket.id),
      });

      // Notify all players in the room
      io.to(cleanRoomCode).emit("player_reconnected", {
        playerName: cleanUsername,
        gameState: rooms[cleanRoomCode].getState(),
      });
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

      if (room.players.length <= 1) {
        socket.emit("error", "Need at least 2 players to start");
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
        });
      });
    } catch (error) {
      console.error("Error starting game:", error);
      socket.emit("error", "Failed to start game");
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
        });
      });

      // Check for winner
      if (room.checkWinner()) {
        // finishGame() is already called in playCard method when someone wins
        const winner = room.getWinner();
        console.log(`Game finished in room ${currentRoom}:`, winner);
        // Save final game state
        await db.saveGameRoom(currentRoom, room);
        io.to(currentRoom).emit("game_over", winner);
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
        });
      });
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
        socket.emit("error", "Round not finished yet");
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

      // Send updated cards to each player
      room.players.forEach((player) => {
        io.to(player.id).emit("your_cards", {
          cards: room.getPlayerCards(player.id),
          validMoves: room.getValidMoves(player.id),
        });
      });
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

      const totals = room.players
        .map((p) => ({ name: p.name, totalScore: p.totalScore }))
        .sort((a, b) => a.totalScore - b.totalScore);

      const winnerName = totals[0]?.name || "";
      const loserName = totals[totals.length - 1]?.name || "";

      io.to(currentRoom).emit("game_totals", {
        totals,
        winner: winnerName,
        loser: loserName,
      });

      room.started = false;
      room.gameFinished = true;
      
      // Save final game state
      await db.saveGameRoom(currentRoom, room);
    } catch (error) {
      console.error("Error exiting game:", error);
      socket.emit("error", "Failed to exit game");
    }
  });

  // Get current game state
  socket.on("get_state", async () => {
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

      socket.emit("game_state", room.getPlayerState(socket.id));
    } catch (error) {
      console.error("Error getting state:", error);
      socket.emit("error", "Failed to get game state");
    }
  });

  // Handle disconnection
  socket.on("disconnect", async () => {
    console.log(`User disconnected: ${socket.id}`);

    try {
      if (currentRoom && rooms[currentRoom]) {
        const room = rooms[currentRoom];
        const wasGameStarted = room.started;
        const wasCurrentPlayer =
          room.players[room.currentPlayerIndex]?.id === socket.id;

        if (wasGameStarted) {
          // Game has started - immediately redistribute cards for faster gameplay
          console.log(`Player ${playerName} disconnected during game. Immediately redistributing cards.`);

          // If the disconnected player was the current turn, automatically pass their turn
          if (wasCurrentPlayer && !room.gameFinished) {
            console.log(`Auto-passing turn for disconnected player ${playerName}`);
            room.nextTurn();
          }

          // Remove player and redistribute their cards immediately to keep game playable
          room.removePlayer(socket.id, true);
          await db.removePlayerFromRoom(socket.id, currentRoom);
          await db.saveGameRoom(currentRoom, room);
          
          // Broadcast cards redistribution
          io.to(currentRoom).emit("cards_redistributed", {
            message: `${playerName} was removed. Cards redistributed to continue the game.`,
          });
          
          // Send updated cards to all remaining players
          room.players.forEach((player) => {
            io.to(player.id).emit("your_cards", {
              cards: room.getPlayerCards(player.id),
              validMoves: room.getValidMoves(player.id),
            });
          });
          
          // Update game state for all players
          io.to(currentRoom).emit("player_disconnected", {
            playerName,
            gameState: room.getState(),
          });

          // Check if only one player remains after redistribution
          if (!room.gameFinished && room.players.length === 1) {
            // Notify the last player that all others left and end the game
            io.to(currentRoom).emit("game_over", {
              type: "all_players_left",
              winner: room.players[0].name,
              message: "All other players have left the game",
            });
            room.gameFinished = true;
            await db.saveGameRoom(currentRoom, room);
          }
        } else {
          // Game hasn't started - allow reconnection
          console.log(`Player ${playerName} disconnected from waiting room - allowing reconnection`);
          
          // Mark player as disconnected but don't remove them yet
          room.setPlayerDisconnected(socket.id);
          
          // Set reconnection opportunity in database (10 minutes for waiting room)
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

  // Removed reconnection logic - players who disconnect are removed for fair gameplay
});

// Generate a 6-character room code
function generateRoomCode() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  // Ensure unique room code
  if (rooms[result]) {
    return generateRoomCode();
  }

  return result;
}

// Graceful shutdown handling
let isShuttingDown = false;
async function shutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`\n📦 ${signal} received. Shutting down gracefully...`);

  try {
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

// Catch-all route - serve React app for all unmatched routes
app.get("*", (req, res) => {
  // Always serve fresh HTML with no-cache headers
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.sendFile(path.join(__dirname, "../client/dist/index.html"));
});

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
