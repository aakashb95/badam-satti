// Global variables
let socket;
let myUsername = "";
let currentRoom = "";
let gameState = null;
let myCards = [];
let validMoves = [];
let canPass = false;
let isMyTurn = false;
let reconnectAttempts = 0;
let maxReconnectAttempts = 5;
let autoPassTimeout = null;
let countdownInterval = null;

// Initialize socket connection
function initializeSocket() {
  socket = io();

  // Connection events
  socket.on("connect", () => {
    console.log("Connected to server");
    console.log("Socket ID:", socket.id);
    // Don't hide loading immediately - wait for specific responses
    reconnectAttempts = 0;
  });

  socket.on("disconnect", () => {
    console.log("Disconnected from server");
    showLoading("Connection lost. Reconnecting...");
    attemptReconnection();
  });

  socket.on("connect_error", (error) => {
    console.error("Connection error:", error);
    showError("Connection failed. Please check your internet connection.");
  });

  // Room events
  socket.on("room_created", ({ roomCode, gameState: state }) => {
    console.log("Room created:", roomCode);
    currentRoom = roomCode;
    gameState = state;
    hideLoading();
    showWaitingRoom();
  });

  socket.on("room_joined", ({ roomCode, gameState: state }) => {
    console.log("Room joined:", roomCode);
    currentRoom = roomCode;
    gameState = state;
    hideLoading();
    showWaitingRoom();
  });

  socket.on("player_joined", ({ playerName, gameState: state }) => {
    console.log("Player joined:", playerName);
    gameState = state;
    updateWaitingRoom();
    showNotification(`${playerName} joined the room`);
  });

  socket.on("player_disconnected", ({ playerName, gameState: state }) => {
    console.log("Player disconnected:", playerName);
    gameState = state;
    if (gameState.started) {
      updateGameScreen();
    } else {
      updateWaitingRoom();
    }
    showNotification(`${playerName} disconnected`);
  });

  socket.on("player_reconnected", ({ playerName, gameState: state }) => {
    console.log("Player reconnected:", playerName);
    gameState = state;
    if (gameState.started) {
      updateGameScreen();
    } else {
      updateWaitingRoom();
    }
    showNotification(`${playerName} reconnected`);
  });

  // Game events
  socket.on("game_started", ({ gameState: state }) => {
    console.log("Game started");
    gameState = state;
    showGameScreen();
  });

  socket.on("your_cards", ({ cards, validMoves: moves }) => {
    console.log("Received cards:", cards);
    myCards = cards;
    validMoves = moves;
    canPass = moves.length === 0;
    updateMyCards();
    updateGameActions();
  });

  socket.on("card_played", ({ playerName, card, gameState: state }) => {
    console.log(`${playerName} played ${card.rank} of ${card.suit}`);
    gameState = state;
    updateGameScreen();
    showNotification(
      `${playerName} played ${getRankDisplay(card.rank)} of ${getSuitName(
        card.suit
      )}`
    );
  });

  socket.on("turn_passed", ({ playerName, gameState: state }) => {
    console.log(`${playerName} passed`);
    gameState = state;
    updateGameScreen();
    showNotification(`${playerName} passed`);
  });

  socket.on("game_over", (winner) => {
    console.log("Game over:", winner);
    clearTimeout(autoPassTimeout);
    showGameOver(winner);
  });

  socket.on("reconnected", ({ gameState: state }) => {
    console.log("Reconnected successfully");
    gameState = state;
    hideLoading();
    if (gameState.started) {
      showGameScreen();
    } else {
      showWaitingRoom();
    }
  });

  // Listen for new round
  socket.on("round_continued", ({ gameState: state }) => {
    console.log("Round continued");
    gameState = state;
    hideLoading();
    showGameScreen();
  });

  // Listen for cumulative totals when game is exited
  socket.on("game_totals", (summary) => {
    console.log("Received game totals", summary);
    hideLoading();
    showSummary(summary);
  });

  // Error handling
  socket.on("error", (message) => {
    console.error("Server error:", message);
    hideLoading();
    showError(message);
  });
}

// UI Navigation Functions
function showScreen(screenId) {
  document.querySelectorAll(".screen").forEach((screen) => {
    screen.classList.add("hidden");
  });
  document.getElementById(screenId).classList.remove("hidden");
}

function showLoading(message = "Loading...") {
  document.getElementById("loading-message").textContent = message;
  showScreen("loading-screen");
}

function hideLoading() {
  if (document.getElementById("loading-screen").classList.contains("hidden")) {
    return;
  }

  // Show appropriate screen based on current state
  if (gameState && gameState.started) {
    showGameScreen();
  } else if (currentRoom) {
    showWaitingRoom();
  } else if (myUsername) {
    showScreen("menu-screen");
  } else {
    showScreen("login-screen");
  }
}

function showMainMenu() {
  const username = document.getElementById("username").value.trim();
  if (!username) {
    showError("Please enter your name");
    return;
  }

  if (username.length > 20) {
    showError("Name too long (max 20 characters)");
    return;
  }

  myUsername = username;
  document.getElementById("welcome").textContent = `Welcome, ${myUsername}!`;
  showScreen("menu-screen");
}

function showWaitingRoom() {
  showScreen("waiting-screen");
  document.getElementById("room-display").textContent = currentRoom;

  // Show start button only for room creator
  if (
    gameState &&
    gameState.players.length > 0 &&
    gameState.players[0].name === myUsername
  ) {
    document.getElementById("start-btn").classList.remove("hidden");
  } else {
    document.getElementById("start-btn").classList.add("hidden");
  }

  updateWaitingRoom();
}

function showGameScreen() {
  showScreen("game-screen");
  updateGameScreen();
}

function showGameOver(winner) {
  showScreen("game-over-screen");

  const winnerDisplay = document.getElementById("winner-display");
  const finalScores = document.getElementById("final-scores");

  winnerDisplay.innerHTML = `<h3>🏆 ${winner.winner} Wins!</h3><p>Game Over - First to empty their hand!</p>`;
  finalScores.innerHTML = `
    <h4>Final Scores (Remaining Cards):</h4>
    <div class="scores-list">
      ${winner.finalScores
        .map(
          (score) =>
            `<div class="score-item ${score.isWinner ? "winner" : ""}">
          <span class="player-name">${score.name}</span>
          <span class="player-score">${score.score} points</span>
        </div>`
        )
        .join("")}
    </div>
    <div class="scoring-info">
      <small>
        Scoring: A=1, Numbers=face value, J=11, Q=12, K=13<br>
        Lower scores are better!
      </small>
    </div>
  `;
}

// Room Management
function createRoom() {
  if (!myUsername) {
    showError("Please enter your name first");
    return;
  }

  if (!socket || !socket.connected) {
    showError("Not connected to server. Please refresh the page.");
    return;
  }

  showLoading("Creating room...");
  socket.emit("create_room", myUsername);
}

function joinRoom() {
  const roomCode = document
    .getElementById("room-code")
    .value.trim()
    .toUpperCase();

  if (!myUsername) {
    showError("Please enter your name first");
    return;
  }

  if (!roomCode || roomCode.length !== 6) {
    showError("Please enter a valid 6-character room code");
    return;
  }

  if (!socket || !socket.connected) {
    showError("Not connected to server. Please refresh the page.");
    return;
  }

  showLoading("Joining room...");
  socket.emit("join_room", { roomCode, username: myUsername });
}

function leaveRoom() {
  currentRoom = "";
  gameState = null;
  myCards = [];
  validMoves = [];
  clearTimeout(autoPassTimeout);
  clearInterval(countdownInterval);
  socket.disconnect();
  socket.connect();
  showScreen("menu-screen");
}

function leaveGame() {
  leaveRoom();
}

function startGame() {
  if (!gameState || gameState.players.length < 2) {
    showError("Need at least 2 players to start");
    return;
  }

  if (gameState.players.length > 11) {
    showError("Too many players (max 11)");
    return;
  }

  showLoading("Starting game...");
  socket.emit("start_game");
}

function copyRoomCode() {
  if (navigator.clipboard) {
    navigator.clipboard
      .writeText(currentRoom)
      .then(() => {
        showNotification("Room code copied to clipboard!");
      })
      .catch((err) => {
        console.error("Failed to copy: ", err);
        showNotification("Failed to copy room code");
      });
  } else {
    // Fallback for older browsers
    const textArea = document.createElement("textarea");
    textArea.value = currentRoom;
    document.body.appendChild(textArea);
    textArea.select();
    try {
      document.execCommand("copy");
      showNotification("Room code copied to clipboard!");
    } catch (err) {
      console.error("Failed to copy: ", err);
      showNotification("Failed to copy room code");
    }
    document.body.removeChild(textArea);
  }
}

// Game Actions
function playCard(card) {
  if (!isMyTurn) {
    showError("It's not your turn");
    return;
  }

  if (
    !validMoves.some(
      (move) => move.suit === card.suit && move.rank === card.rank
    )
  ) {
    showError("Invalid move");
    return;
  }

  clearTimeout(autoPassTimeout);
  clearInterval(countdownInterval);
  socket.emit("play_card", card);
}

function passTurn() {
  if (!isMyTurn) {
    showError("It's not your turn");
    return;
  }

  if (!canPass) {
    showError("You have valid moves - cannot pass");
    return;
  }

  clearTimeout(autoPassTimeout);
  clearInterval(countdownInterval);
  socket.emit("pass_turn");
}

// Update Functions
function updateWaitingRoom() {
  if (!gameState) return;

  const playersList = document.getElementById("players-list");
  const playerCount = document.getElementById("player-count");

  playerCount.textContent = `(${gameState.players.length}/11)`;

  playersList.innerHTML = gameState.players
    .map(
      (player) => `
    <div class="player-item ${player.connected ? "connected" : "disconnected"}">
      <span class="player-name">${player.name}</span>
      <span class="player-status">${player.connected ? "🔵" : "🔴"}</span>
    </div>
  `
    )
    .join("");
}

function updateGameScreen() {
  if (!gameState) return;

  // Update round info
  const roundDisplay = document.getElementById("round-display");
  if (roundDisplay) {
    roundDisplay.textContent = `Round ${gameState.round}/${gameState.maxRounds}`;
  }

  // Update turn info
  const turnDisplay = document.getElementById("turn-display");
  isMyTurn = gameState.currentPlayerName === myUsername;

  if (turnDisplay) {
    if (isMyTurn) {
      turnDisplay.textContent = "Your Turn";
      turnDisplay.className = "my-turn";
    } else {
      turnDisplay.textContent = `${gameState.currentPlayerName}'s Turn`;
      turnDisplay.className = "other-turn";
    }
  }

  // Update players info
  updatePlayersInfo();

  // Update board
  updateBoard();

  // Update game actions
  updateGameActions();

  // Set up auto-play/auto-pass timer if it's my turn
  if (isMyTurn) {
    clearTimeout(autoPassTimeout);
    clearInterval(countdownInterval);

    let timeLeft = 10;
    const updateCountdown = () => {
      const turnDisplay = document.getElementById("turn-display");
      if (turnDisplay && isMyTurn) {
        turnDisplay.textContent = `Your Turn (${timeLeft}s)`;
      }
      if (timeLeft > 0) {
        timeLeft--;
      }
    };

    updateCountdown();
    countdownInterval = setInterval(updateCountdown, 1000);

    autoPassTimeout = setTimeout(() => {
      console.log(
        "Auto-play timeout triggered. isMyTurn:",
        isMyTurn,
        "validMoves:",
        validMoves.length,
        "canPass:",
        canPass
      );
      if (isMyTurn && gameState && gameState.currentPlayerName === myUsername) {
        clearInterval(countdownInterval);
        if (validMoves.length > 0) {
          // Auto-play a random valid move
          const randomMove =
            validMoves[Math.floor(Math.random() * validMoves.length)];
          console.log("Auto-playing random card:", randomMove);
          showNotification("Auto-playing random card");
          playCard(randomMove);
        } else if (canPass) {
          // Auto-pass if no valid moves
          console.log("Auto-passing turn");
          showNotification("Auto-passing turn");
          passTurn();
        } else {
          console.log(
            "Cannot auto-play or auto-pass - player has valid moves but canPass is false"
          );
        }
      } else {
        console.log("Auto-play timeout but not my turn anymore");
      }
    }, 10000); // Auto-play/pass after 10 seconds
  } else {
    clearTimeout(autoPassTimeout);
    clearInterval(countdownInterval);
  }
}

function updatePlayersInfo() {
  if (!gameState) return;

  const playersInfo = document.getElementById("players-info");
  if (!playersInfo) return;

  playersInfo.innerHTML = gameState.players
    .map(
      (player) => `
    <div class="player-info ${player.isCurrentPlayer ? "current-player" : ""} ${
        player.connected ? "connected" : "disconnected"
      }">
      <div class="player-name">${player.name}</div>
      <div class="player-cards">${player.cardCount} cards</div>
      <div class="player-status">${player.connected ? "🔵" : "🔴"}</div>
    </div>
  `
    )
    .join("");
}

function updateBoard() {
  if (!gameState) return;

  Object.entries(gameState.board).forEach(([suit, suitObj]) => {
    const cardsDisplay = document.getElementById(`${suit}-cards`);
    if (!cardsDisplay) return;

    // Build array so that lower ranks appear first (bottom), then 7, then higher ranks
    const lower = (suitObj.down || []).slice().reverse();
    const higher = (suitObj.up || []).slice();
    const ranksForDisplay = [...lower, ...higher];

    cardsDisplay.innerHTML = ranksForDisplay
      .map((rank, idx) => {
        const card = { suit, rank };
        return `<img src="images/cards/${getCardFilename(
          card
        )}" class="board-card-img" style="margin-top:${
          idx === 0 ? 0 : -40
        }px;" />`;
      })
      .join("");
  });
}

function updateMyCards() {
  const myCardsContainer = document.getElementById("my-cards");
  if (!myCardsContainer) return;

  const suitOrder = ["hearts", "diamonds", "clubs", "spades"];

  const html = suitOrder
    .map((suit) => {
      const cardsOfSuit = myCards
        .filter((c) => c.suit === suit)
        .sort((a, b) => a.rank - b.rank);

      if (cardsOfSuit.length === 0) return "";

      const cardsHtml = cardsOfSuit
        .map((card, idx) => {
          const isValid = validMoves.some(
            (move) => move.suit === card.suit && move.rank === card.rank
          );
          const playClass = isMyTurn && isValid ? "playable" : "";
          return `<img src="images/cards/${getCardFilename(
            card
          )}" class="hand-card ${
            isValid ? "valid" : ""
          } ${playClass}" onclick="playCard({suit:'${card.suit}',rank:${
            card.rank
          }})" />`;
        })
        .join("");

      return `<div class="hand-suit">${cardsHtml}</div>`;
    })
    .join(" ");

  myCardsContainer.innerHTML = html;
}

function updateGameActions() {
  const passBtn = document.getElementById("pass-btn");
  if (!passBtn) return;

  if (isMyTurn && canPass) {
    passBtn.disabled = false;
    passBtn.textContent = "Pass Turn";
  } else if (isMyTurn && !canPass) {
    passBtn.disabled = true;
    passBtn.textContent = "You must play a card";
  } else {
    passBtn.disabled = true;
    passBtn.textContent = "Not your turn";
  }
}

// Utility Functions
function getSuitSymbol(suit) {
  const symbols = {
    hearts: "♥",
    diamonds: "♦",
    clubs: "♣",
    spades: "♠",
  };
  return symbols[suit] || suit;
}

function getSuitName(suit) {
  const names = {
    hearts: "Hearts",
    diamonds: "Diamonds",
    clubs: "Clubs",
    spades: "Spades",
  };
  return names[suit] || suit;
}

function getSuitColor(suit) {
  return suit === "hearts" || suit === "diamonds" ? "red" : "black";
}

function getRankDisplay(rank) {
  if (rank === 1) return "A";
  if (rank === 11) return "J";
  if (rank === 12) return "Q";
  if (rank === 13) return "K";
  return rank.toString();
}

// Get filename for SVG deck (e.g. AH.svg, 10S.svg)
function getCardFilename(card) {
  const suitLetters = { hearts: "H", diamonds: "D", clubs: "C", spades: "S" };
  const rankMap = { 1: "A", 11: "J", 12: "Q", 13: "K" };
  const rankPart = rankMap[card.rank] || card.rank.toString();
  return `${rankPart}${suitLetters[card.suit]}.svg`;
}

// Modal and Notification Functions
function showError(message) {
  document.getElementById("error-message").textContent = message;
  document.getElementById("error-modal").classList.remove("hidden");
}

function closeError() {
  document.getElementById("error-modal").classList.add("hidden");
}

function showNotification(message) {
  const notification = document.getElementById("notification");
  const notificationText = document.getElementById("notification-text");

  notificationText.textContent = message;
  notification.classList.remove("hidden");

  setTimeout(() => {
    notification.classList.add("hidden");
  }, 3000);
}

function returnToMenu() {
  leaveRoom();
}

// Reconnection Logic
function attemptReconnection() {
  if (reconnectAttempts >= maxReconnectAttempts) {
    showError("Connection lost. Please refresh the page.");
    return;
  }

  reconnectAttempts++;
  showLoading(`Reconnecting... (${reconnectAttempts}/${maxReconnectAttempts})`);

  setTimeout(() => {
    if (socket.disconnected) {
      socket.connect();
    }
  }, 2000 * reconnectAttempts);
}

// Extra actions after a round ends
function continueRound() {
  showLoading("Starting next round...");
  socket.emit("continue_round");
}

function exitGame() {
  showLoading("Calculating results...");
  socket.emit("exit_game");
}

function showSummary(summary) {
  showScreen("summary-screen");
  const summaryScores = document.getElementById("summary-scores");
  summaryScores.innerHTML = `
    <h4>Cumulative Scores:</h4>
    <div class="scores-list">
      ${summary.totals
        .map(
          (s) => `
        <div class="score-item ${
          s.name === summary.winner
            ? "winner"
            : s.name === summary.loser
            ? "loser"
            : ""
        }">
          <span class="player-name">${s.name}</span>
          <span class="player-score">${s.totalScore} points</span>
        </div>
      `
        )
        .join("")}
    </div>
    <p><strong>Winner:</strong> ${
      summary.winner
    } &nbsp;&nbsp; <strong>Loser:</strong> ${summary.loser}</p>
  `;
}

// Initialize app
document.addEventListener("DOMContentLoaded", function () {
  // Start on login screen
  showScreen("login-screen");
  initializeSocket();

  // Handle visibility change (app going to background)
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) {
      console.log("App went to background");
    } else {
      console.log("App came to foreground");
      // Refresh game state when app comes back
      if (currentRoom && gameState) {
        socket.emit("get_state");
      }
    }
  });

  // Handle online/offline events
  window.addEventListener("online", function () {
    console.log("Back online");
    showNotification("Connection restored");
    if (socket.disconnected) {
      socket.connect();
    }
  });

  window.addEventListener("offline", function () {
    console.log("Gone offline");
    showNotification("Connection lost");
  });
});

// Prevent accidental page reload
window.addEventListener("beforeunload", function (e) {
  if (currentRoom && gameState && gameState.started) {
    e.preventDefault();
    e.returnValue = "";
  }
});
