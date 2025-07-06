const express = require("express");
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

// Store all game rooms
const rooms = {};

// Cleanup interval to remove empty rooms
setInterval(() => {
  Object.keys(rooms).forEach((roomCode) => {
    if (rooms[roomCode].isRoomEmpty()) {
      console.log(`Cleaning up empty room: ${roomCode}`);
      delete rooms[roomCode];
    }
  });
}, 60000); // Clean up every minute

// Serve static files from client directory
app.use(express.static(path.join(__dirname, "../client")));

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    rooms: Object.keys(rooms).length,
    timestamp: new Date().toISOString(),
  });
});

// Main route
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../client/index.html"));
});

// Socket.io connection handling
io.on("connection", (socket) => {
  console.log(`User connected: ${socket.id}`);

  let currentRoom = null;
  let playerName = null;

  // Create a new room
  socket.on("create_room", (username) => {
    try {
      if (!username || username.trim().length === 0) {
        socket.emit("error", "Username is required");
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
  socket.on("join_room", ({ roomCode, username }) => {
    try {
      if (!roomCode || !username) {
        socket.emit("error", "Room code and username are required");
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
  socket.on("start_game", () => {
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
  socket.on("play_card", (card) => {
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
        io.to(currentRoom).emit("game_over", winner);
      }
    } catch (error) {
      console.error("Error playing card:", error);
      socket.emit("error", "Failed to play card");
    }
  });

  // Pass turn
  socket.on("pass_turn", () => {
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
  socket.on("continue_round", () => {
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
  socket.on("exit_game", () => {
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
  socket.on("disconnect", () => {
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

  // Handle reconnection
  socket.on("reconnect_player", ({ roomCode, username }) => {
    try {
      if (!rooms[roomCode]) {
        socket.emit("error", "Room not found");
        return;
      }

      const room = rooms[roomCode];
      const player = room.players.find((p) => p.name === username);

      if (!player) {
        socket.emit("error", "Player not found in room");
        return;
      }

      // Update player connection
      player.id = socket.id;
      player.connected = true;

      socket.join(roomCode);
      currentRoom = roomCode;
      playerName = username;

      console.log(`${playerName} reconnected to room: ${roomCode}`);

      // Send current state to reconnected player
      socket.emit("reconnected", {
        gameState: room.getPlayerState(socket.id),
      });

      // Notify other players
      socket.to(roomCode).emit("player_reconnected", {
        playerName,
        gameState: room.getState(),
      });
    } catch (error) {
      console.error("Error reconnecting player:", error);
      socket.emit("error", "Failed to reconnect");
    }
  });
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

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🎮 Badam Satti server running on port ${PORT}`);
  console.log(`📱 Open http://localhost:${PORT} in your browser`);
  console.log(
    `🌐 Or share your IP address with family: http://YOUR_IP:${PORT}`
  );
});
