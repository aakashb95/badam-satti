const express = require("express");
const rateLimit = require("express-rate-limit");
const app = express();
const server = require("http").createServer(app);
const io = require("socket.io")(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
  pingTimeout: 60000,
  pingInterval: 25000,
});
const path = require("path");

const { GameRoom } = require("./gameLogic");
const Database = require("./database");

// Initialize database
const db = new Database();

// Store all game rooms (in-memory cache + database persistence)
const rooms = {};

// Rate limiting middleware
const createRoomLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 10, // limit each IP to 10 room creations per windowMs
  message: { error: "Too many room creation attempts, please try again later" },
  standardHeaders: true,
  legacyHeaders: false,
});

const joinRoomLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 20, // limit each IP to 20 join attempts per windowMs
  message: { error: "Too many join attempts, please try again later" },
  standardHeaders: true,
  legacyHeaders: false,
});

// Middleware for parsing JSON
app.use(express.json());

// Apply rate limiting to room creation
app.use('/api/create-room', createRoomLimiter);
app.use('/api/join-room', joinRoomLimiter);

// Cleanup interval to remove empty rooms and persist active ones
setInterval(async () => {
  try {
    // Cleanup empty rooms from memory
    for (const roomCode of Object.keys(rooms)) {
      if (rooms[roomCode].isRoomEmpty()) {
        console.log(`Cleaning up empty room: ${roomCode}`);
        await db.deactivateRoom(roomCode);
        delete rooms[roomCode];
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
app.use(express.static(path.join(__dirname, "../client/dist")));

// Health check endpoint
app.get("/health", async (req, res) => {
  try {
    const dbHealth = await db.healthCheck();
    const activeRooms = await db.getAllActiveRooms();
    
    res.json({
      status: "ok",
      memory_rooms: Object.keys(rooms).length,
      database_rooms: activeRooms.length,
      database: dbHealth,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Health check error:', error);
    res.status(500).json({
      status: "error",
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

// Detailed health endpoint
app.get("/health/detailed", async (req, res) => {
  try {
    const dbHealth = await db.healthCheck();
    const activeRooms = await db.getAllActiveRooms();
    
    res.json({
      status: "ok",
      server: {
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        pid: process.pid,
      },
      rooms: {
        memory_count: Object.keys(rooms).length,
        database_count: activeRooms.length,
        active_rooms: activeRooms.map(room => ({
          room_code: room.room_code,
          created_at: room.created_at,
          updated_at: room.updated_at
        })),
      },
      database: dbHealth,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Detailed health check error:', error);
    res.status(500).json({
      status: "error",
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});


// Socket.io connection handling
io.on("connection", (socket) => {
  console.log(`User connected: ${socket.id}`);

  let currentRoom = null;
  let playerName = null;

  // Create a new room
  socket.on("create_room", async (username) => {
    try {
      if (!username || username.trim().length === 0) {
        socket.emit("error", "Username is required");
        return;
      }

      // Check rate limit
      const clientIP = socket.handshake.address;
      const rateLimitCheck = await db.checkRateLimit(clientIP, 10, 1);
      if (!rateLimitCheck.allowed) {
        socket.emit("error", "Too many room creation attempts. Please wait.");
        return;
      }

      const roomCode = generateRoomCode();
      rooms[roomCode] = new GameRoom(roomCode);

      const success = rooms[roomCode].addPlayer(socket.id, username.trim());
      if (!success) {
        socket.emit("error", "Failed to create room");
        return;
      }

      socket.join(roomCode);
      currentRoom = roomCode;
      playerName = username.trim();

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
  socket.on("join_room", async ({ roomCode, username }) => {
    try {
      if (!roomCode || !username) {
        socket.emit("error", "Room code and username are required");
        return;
      }

      // Check rate limit
      const clientIP = socket.handshake.address;
      const rateLimitCheck = await db.checkRateLimit(clientIP, 20, 1);
      if (!rateLimitCheck.allowed) {
        socket.emit("error", "Too many join attempts. Please wait.");
        return;
      }

      const cleanRoomCode = roomCode.toUpperCase().trim();
      const cleanUsername = username.trim();

      if (!rooms[cleanRoomCode]) {
        socket.emit("error", "Room not found");
        return;
      }

      if (rooms[cleanRoomCode].started) {
        socket.emit("error", "Game already started");
        return;
      }

      // Check if username already exists in room
      if (rooms[cleanRoomCode].players.find((p) => p.name === cleanUsername)) {
        socket.emit("error", "Username already taken in this room");
        return;
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

  // Start the game
  socket.on("start_game", async () => {
    try {
      if (!currentRoom || !rooms[currentRoom]) {
        socket.emit("error", "Not in a valid room");
        return;
      }

      // Only the first player (room creator) can start the game
      if (rooms[currentRoom].players[0].id !== socket.id) {
        socket.emit("error", "Only room creator can start the game");
        return;
      }

      if (rooms[currentRoom].players.length <= 1) {
        socket.emit("error", "Need at least 2 players to start");
        return;
      }

      const success = rooms[currentRoom].startGame();
      if (!success) {
        socket.emit("error", "Failed to start game");
        return;
      }

      // Save game state to database
      await db.saveGameRoom(currentRoom, rooms[currentRoom]);

      console.log(`Game started in room: ${currentRoom}`);
      io.to(currentRoom).emit("game_started", {
        gameState: rooms[currentRoom].getState(),
      });

      // Send each player their cards
      rooms[currentRoom].players.forEach((player) => {
        io.to(player.id).emit("your_cards", {
          cards: rooms[currentRoom].getPlayerCards(player.id),
          validMoves: rooms[currentRoom].getValidMoves(player.id),
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
      if (!currentRoom || !rooms[currentRoom]) {
        socket.emit("error", "Not in a valid room");
        return;
      }

      const room = rooms[currentRoom];
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
        room.finishGame();
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
      if (!currentRoom || !rooms[currentRoom]) {
        socket.emit("error", "Not in a valid room");
        return;
      }

      const room = rooms[currentRoom];
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
      if (!currentRoom || !rooms[currentRoom]) {
        socket.emit("error", "Not in a valid room");
        return;
      }

      const room = rooms[currentRoom];
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
      if (!currentRoom || !rooms[currentRoom]) {
        socket.emit("error", "Not in a valid room");
        return;
      }

      const room = rooms[currentRoom];

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
  socket.on("get_state", () => {
    try {
      if (!currentRoom || !rooms[currentRoom]) {
        socket.emit("error", "Not in a valid room");
        return;
      }

      socket.emit("game_state", rooms[currentRoom].getPlayerState(socket.id));
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

        // Remove player and redistribute cards if game has started
        room.removePlayer(socket.id, wasGameStarted);

        // If the game was started and the disconnected player was the current turn,
        // move turn to the next appropriate player
        if (wasGameStarted && wasCurrentPlayer && !room.gameFinished) {
          room.nextTurn();
        }

        // Save updated game state
        await db.saveGameRoom(currentRoom, room);

        // Broadcast updated state to remaining players
        io.to(currentRoom).emit("player_disconnected", {
          playerName,
          gameState: room.getState(),
        });

        // Send updated cards to all remaining players if cards were redistributed
        if (wasGameStarted && !room.gameFinished) {
          // Check if only one player remains
          if (room.players.length === 1) {
            // Notify the last player that all others left and end the game
            io.to(currentRoom).emit("game_over", {
              type: "all_players_left",
              winner: room.players[0].name,
              message: "All other players have left the game",
            });
            room.gameFinished = true;
            await db.saveGameRoom(currentRoom, room);
          } else {
            // Notify about card redistribution
            io.to(currentRoom).emit("cards_redistributed", {
              message: `${playerName}'s cards have been redistributed`,
              redistributedCardCount:
                room.players.length > 0
                  ? Math.floor(52 / room.players.length)
                  : 0,
            });

            // Send updated cards to all remaining players
            room.players.forEach((player) => {
              io.to(player.id).emit("your_cards", {
                cards: room.getPlayerCards(player.id),
                validMoves: room.getValidMoves(player.id),
              });
            });
          }
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
process.on('SIGINT', async () => {
  console.log('\n📦 Shutting down gracefully...');
  
  try {
    // Save all active rooms to database
    for (const [roomCode, room] of Object.entries(rooms)) {
      await db.saveGameRoom(roomCode, room);
    }
    
    // Close database connection
    db.close();
    
    // Close server
    server.close(() => {
      console.log('✅ Server closed gracefully');
      process.exit(0);
    });
  } catch (error) {
    console.error('❌ Error during shutdown:', error);
    process.exit(1);
  }
});

// Catch-all route - serve React app for all unmatched routes
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "../client/dist/index.html"));
});

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🎮 Badam Satti server running on port ${PORT}`);
  console.log(`📱 Open http://localhost:${PORT} in your browser`);
  console.log(
    `🌐 Or share your IP address with family: http://YOUR_IP:${PORT}`
  );
  console.log(`📦 SQLite database initialized`);
  console.log(`🛡️  Rate limiting enabled`);
  console.log(`🔄 Game persistence enabled`);
});
