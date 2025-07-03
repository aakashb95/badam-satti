# Badam Satti PWA - Minimal Spec (v0)

## Overview
A Progressive Web App for playing Badam Satti with family. No login, no database, just enter a username and play.

## Tech Stack (Dead Simple)

### Frontend (PWA)
- **Vanilla JavaScript** or **React** (your choice)
- **Socket.io-client** for real-time
- **CSS Grid/Flexbox** for responsive layout
- **Service Worker** for offline caching

### Backend
- **Node.js + Express**
- **Socket.io** for WebSocket
- **In-memory game state** (no database)

## How It Works

1. Open website
2. Enter username
3. Create room → Get 6-letter code
4. Share code with family
5. Others join with code
6. Creator starts game
7. Play!

## File Structure

```
badam-satti/
├── server/
│   ├── index.js         # Express + Socket.io server
│   ├── gameLogic.js     # Game rules
│   └── package.json
├── client/
│   ├── index.html       # Single page
│   ├── style.css        # Minimal styling
│   ├── app.js          # Game client
│   ├── manifest.json    # PWA manifest
│   └── sw.js           # Service worker
└── package.json
```

## Minimal Game State

```javascript
const rooms = {
  'ABC123': {
    players: [
      { id: 'socket-id', name: 'Player1', cards: [], connected: true }
    ],
    board: {
      hearts: { up: [], down: [] },
      diamonds: { up: [], down: [] },
      clubs: { up: [], down: [] },
      spades: { up: [], down: [] }
    },
    currentPlayer: 0,
    started: false
  }
};
```

## Backend Code Structure

### server/index.js
```javascript
const express = require('express');
const app = express();
const server = require('http').createServer(app);
const io = require('socket.io')(server, {
  cors: { origin: '*' }
});

const { GameRoom } = require('./gameLogic');
const rooms = {};

// Serve static files
app.use(express.static('../client'));

io.on('connection', (socket) => {
  let currentRoom = null;
  let playerName = null;

  socket.on('create_room', (username) => {
    const roomCode = generateRoomCode();
    rooms[roomCode] = new GameRoom(roomCode);
    rooms[roomCode].addPlayer(socket.id, username);
    
    socket.join(roomCode);
    currentRoom = roomCode;
    playerName = username;
    
    socket.emit('room_created', { roomCode, gameState: rooms[roomCode].getState() });
  });

  socket.on('join_room', ({ roomCode, username }) => {
    if (!rooms[roomCode]) {
      socket.emit('error', 'Room not found');
      return;
    }
    
    rooms[roomCode].addPlayer(socket.id, username);
    socket.join(roomCode);
    currentRoom = roomCode;
    playerName = username;
    
    io.to(roomCode).emit('player_joined', rooms[roomCode].getState());
  });

  socket.on('start_game', () => {
    if (rooms[currentRoom]) {
      rooms[currentRoom].startGame();
      io.to(currentRoom).emit('game_started', rooms[currentRoom].getState());
    }
  });

  socket.on('play_card', (card) => {
    const room = rooms[currentRoom];
    if (room && room.playCard(socket.id, card)) {
      io.to(currentRoom).emit('card_played', room.getState());
      
      if (room.checkWinner()) {
        io.to(currentRoom).emit('game_over', room.getWinner());
      }
    }
  });

  socket.on('pass_turn', () => {
    const room = rooms[currentRoom];
    if (room && room.passTurn(socket.id)) {
      io.to(currentRoom).emit('turn_passed', room.getState());
    }
  });

  socket.on('disconnect', () => {
    // Mark player as disconnected but keep their spot
    if (currentRoom && rooms[currentRoom]) {
      rooms[currentRoom].setPlayerDisconnected(socket.id);
      io.to(currentRoom).emit('player_disconnected', { 
        playerName,
        gameState: rooms[currentRoom].getState() 
      });
    }
  });
});

function generateRoomCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

server.listen(3000, () => {
  console.log('Server running on :3000');
});
```

### server/gameLogic.js
```javascript
class GameRoom {
  constructor(roomCode) {
    this.roomCode = roomCode;
    this.players = [];
    this.board = {
      hearts: { up: [], down: [] },
      diamonds: { up: [], down: [] },
      clubs: { up: [], down: [] },
      spades: { up: [], down: [] }
    };
    this.currentPlayerIndex = 0;
    this.started = false;
    this.deck = [];
  }

  addPlayer(id, name) {
    if (this.players.length >= 11) return false;
    this.players.push({ id, name, cards: [], connected: true });
    return true;
  }

  startGame() {
    if (this.players.length < 4) return false;
    this.started = true;
    this.deck = this.createDeck();
    this.shuffleDeck();
    this.dealCards();
    
    // Find who has 7 of hearts
    this.currentPlayerIndex = this.players.findIndex(p => 
      p.cards.some(c => c.suit === 'hearts' && c.rank === 7)
    );
    
    // Auto-play 7 of hearts
    this.playCard(this.players[this.currentPlayerIndex].id, { suit: 'hearts', rank: 7 });
    return true;
  }

  createDeck() {
    const suits = ['hearts', 'diamonds', 'clubs', 'spades'];
    const deck = [];
    for (let suit of suits) {
      for (let rank = 1; rank <= 13; rank++) {
        deck.push({ suit, rank });
      }
    }
    return deck;
  }

  shuffleDeck() {
    for (let i = this.deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.deck[i], this.deck[j]] = [this.deck[j], this.deck[i]];
    }
  }

  dealCards() {
    const cardsPerPlayer = Math.floor(52 / this.players.length);
    let cardIndex = 0;
    
    for (let i = 0; i < cardsPerPlayer; i++) {
      for (let player of this.players) {
        if (cardIndex < this.deck.length) {
          player.cards.push(this.deck[cardIndex++]);
        }
      }
    }
    
    // Deal remaining cards
    let playerIndex = 0;
    while (cardIndex < this.deck.length) {
      this.players[playerIndex].cards.push(this.deck[cardIndex++]);
      playerIndex = (playerIndex + 1) % this.players.length;
    }
  }

  isValidMove(playerId, card) {
    const player = this.players.find(p => p.id === playerId);
    if (!player || this.players[this.currentPlayerIndex].id !== playerId) return false;
    
    // Check if player has the card
    if (!player.cards.some(c => c.suit === card.suit && c.rank === card.rank)) return false;
    
    const suitBoard = this.board[card.suit];
    
    // If suit not started, must be 7
    if (suitBoard.up.length === 0 && suitBoard.down.length === 0) {
      return card.rank === 7;
    }
    
    // Can play above highest or below lowest
    if (suitBoard.up.length > 0 && card.rank === suitBoard.up[suitBoard.up.length - 1] + 1) return true;
    if (suitBoard.down.length > 0 && card.rank === suitBoard.down[suitBoard.down.length - 1] - 1) return true;
    
    // Special case: 6 or 8 when only 7 is played
    if (suitBoard.up.length === 1 && suitBoard.up[0] === 7 && suitBoard.down.length === 0) {
      return card.rank === 6 || card.rank === 8;
    }
    
    return false;
  }

  playCard(playerId, card) {
    if (!this.isValidMove(playerId, card)) return false;
    
    const player = this.players.find(p => p.id === playerId);
    player.cards = player.cards.filter(c => !(c.suit === card.suit && c.rank === card.rank));
    
    const suitBoard = this.board[card.suit];
    
    if (suitBoard.up.length === 0) {
      suitBoard.up.push(card.rank); // Should be 7
    } else if (card.rank > suitBoard.up[suitBoard.up.length - 1]) {
      suitBoard.up.push(card.rank);
    } else {
      suitBoard.down.push(card.rank);
    }
    
    this.nextTurn();
    return true;
  }

  passTurn(playerId) {
    if (this.players[this.currentPlayerIndex].id !== playerId) return false;
    
    // Check if player really can't play
    const player = this.players[this.currentPlayerIndex];
    const hasValidMove = player.cards.some(card => this.isValidMove(playerId, card));
    
    if (!hasValidMove) {
      this.nextTurn();
      return true;
    }
    return false;
  }

  nextTurn() {
    this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;
  }

  checkWinner() {
    return this.players.some(p => p.cards.length === 0);
  }

  getWinner() {
    const winner = this.players.find(p => p.cards.length === 0);
    const scores = this.players.map(p => ({
      name: p.name,
      score: p.cards.reduce((sum, card) => {
        if (card.rank === 1 || card.rank >= 11) return sum + 10;
        return sum + card.rank;
      }, 0)
    }));
    return { winner: winner.name, scores };
  }

  getState() {
    return {
      roomCode: this.roomCode,
      players: this.players.map(p => ({
        name: p.name,
        cardCount: p.cards.length,
        connected: p.connected,
        isCurrentPlayer: this.players[this.currentPlayerIndex]?.id === p.id
      })),
      board: this.board,
      started: this.started,
      myCards: null // Will be filled client-side
    };
  }

  setPlayerDisconnected(playerId) {
    const player = this.players.find(p => p.id === playerId);
    if (player) player.connected = false;
  }
}

module.exports = { GameRoom };
```

## Frontend (Minimal HTML/JS)

### client/index.html
```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Badam Satti</title>
  <link rel="manifest" href="manifest.json">
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <div id="app">
    <!-- Login Screen -->
    <div id="login-screen" class="screen">
      <h1>Badam Satti</h1>
      <input type="text" id="username" placeholder="Enter your name" maxlength="20">
      <button onclick="showMainMenu()">Continue</button>
    </div>

    <!-- Main Menu -->
    <div id="menu-screen" class="screen hidden">
      <h2 id="welcome"></h2>
      <button onclick="createRoom()">Create Room</button>
      <input type="text" id="room-code" placeholder="Room Code" maxlength="6">
      <button onclick="joinRoom()">Join Room</button>
    </div>

    <!-- Waiting Room -->
    <div id="waiting-screen" class="screen hidden">
      <h2>Room: <span id="room-display"></span></h2>
      <div id="players-list"></div>
      <button id="start-btn" onclick="startGame()" class="hidden">Start Game</button>
      <div id="share-info">Share this code with others</div>
    </div>

    <!-- Game Screen -->
    <div id="game-screen" class="screen hidden">
      <div id="game-board">
        <div class="suit-area" data-suit="hearts">♥</div>
        <div class="suit-area" data-suit="diamonds">♦</div>
        <div class="suit-area" data-suit="clubs">♣</div>
        <div class="suit-area" data-suit="spades">♠</div>
      </div>
      <div id="players-info"></div>
      <div id="my-cards"></div>
      <button id="pass-btn" onclick="passTurn()">Pass</button>
    </div>
  </div>

  <script src="/socket.io/socket.io.js"></script>
  <script src="app.js"></script>
</body>
</html>
```

### client/style.css
```css
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: Arial, sans-serif;
  background: #1a1a1a;
  color: white;
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
}

.screen {
  text-align: center;
  padding: 20px;
}

.hidden {
  display: none !important;
}

input, button {
  display: block;
  margin: 10px auto;
  padding: 10px 20px;
  font-size: 16px;
  border-radius: 5px;
  border: none;
}

input {
  background: #333;
  color: white;
  width: 200px;
}

button {
  background: #4CAF50;
  color: white;
  cursor: pointer;
  min-width: 150px;
}

button:hover {
  background: #45a049;
}

#game-board {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
  margin: 20px auto;
  max-width: 600px;
}

.suit-area {
  background: #2a2a2a;
  padding: 40px;
  border-radius: 10px;
  font-size: 48px;
  min-height: 150px;
}

#my-cards {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 5px;
  margin: 20px 0;
}

.card {
  background: white;
  color: black;
  padding: 10px;
  border-radius: 5px;
  cursor: pointer;
  font-size: 20px;
  min-width: 40px;
}

.card.red {
  color: red;
}

.card.valid {
  box-shadow: 0 0 10px #4CAF50;
}

.card:hover {
  transform: translateY(-5px);
}

#players-info {
  display: flex;
  justify-content: center;
  gap: 20px;
  margin: 20px 0;
}

.player-info {
  padding: 10px;
  background: #333;
  border-radius: 5px;
}

.player-info.current {
  background: #4CAF50;
}
</style>
```

### client/app.js (Key Functions)
```javascript
const socket = io();
let myUsername = '';
let currentRoom = '';
let gameState = null;
let mySocketId = null;

// Socket events
socket.on('connect', () => {
  mySocketId = socket.id;
});

socket.on('room_created', ({ roomCode, gameState: state }) => {
  currentRoom = roomCode;
  gameState = state;
  showWaitingRoom();
});

socket.on('player_joined', (state) => {
  gameState = state;
  updateWaitingRoom();
});

socket.on('game_started', (state) => {
  gameState = state;
  showGameScreen();
});

socket.on('card_played', (state) => {
  gameState = state;
  updateGameScreen();
});

socket.on('game_over', ({ winner, scores }) => {
  alert(`${winner} wins!\n\nScores:\n${scores.map(s => `${s.name}: ${s.score}`).join('\n')}`);
});

// UI Functions
function showMainMenu() {
  myUsername = document.getElementById('username').value.trim();
  if (!myUsername) return;
  
  document.getElementById('welcome').textContent = `Welcome, ${myUsername}!`;
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('menu-screen').classList.remove('hidden');
}

function createRoom() {
  socket.emit('create_room', myUsername);
}

function joinRoom() {
  const roomCode = document.getElementById('room-code').value.toUpperCase();
  if (roomCode.length !== 6) return;
  
  socket.emit('join_room', { roomCode, username: myUsername });
}

function showWaitingRoom() {
  document.getElementById('menu-screen').classList.add('hidden');
  document.getElementById('waiting-screen').classList.remove('hidden');
  document.getElementById('room-display').textContent = currentRoom;
  
  // Show start button for room creator
  if (gameState.players[0].name === myUsername) {
    document.getElementById('start-btn').classList.remove('hidden');
  }
  
  updateWaitingRoom();
}

function updateWaitingRoom() {
  const playersList = document.getElementById('players-list');
  playersList.innerHTML = gameState.players.map(p => 
    `<div>${p.name} ${p.connected ? '✓' : '✗'}</div>`
  ).join('');
}

function startGame() {
  if (gameState.players.length < 4) {
    alert('Need at least 4 players to start');
    return;
  }
  socket.emit('start_game');
}

function showGameScreen() {
  document.getElementById('waiting-screen').classList.add('hidden');
  document.getElementById('game-screen').classList.remove('hidden');
  updateGameScreen();
}

function updateGameScreen() {
  // Update board
  Object.entries(gameState.board).forEach(([suit, cards]) => {
    const suitArea = document.querySelector(`[data-suit="${suit}"]`);
    const display = [];
    if (cards.down.length) display.push(...cards.down.reverse());
    if (cards.up.length) display.push(...cards.up);
    suitArea.innerHTML = getSuitSymbol(suit) + '<br>' + display.join(' ');
  });
  
  // Update players info
  const playersInfo = document.getElementById('players-info');
  playersInfo.innerHTML = gameState.players.map(p => 
    `<div class="player-info ${p.isCurrentPlayer ? 'current' : ''}">
      ${p.name}: ${p.cardCount} cards
    </div>`
  ).join('');
  
  // Update my cards (this is simplified - in real implementation, 
  // you'd need to track which cards belong to this player)
  updateMyCards();
}

function getSuitSymbol(suit) {
  const symbols = { hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠' };
  return symbols[suit];
}

function getRankDisplay(rank) {
  if (rank === 1) return 'A';
  if (rank === 11) return 'J';
  if (rank === 12) return 'Q';
  if (rank === 13) return 'K';
  return rank;
}

// ... more implementation needed for card display and interaction
```

### PWA Files

#### client/manifest.json
```json
{
  "name": "Badam Satti",
  "short_name": "BadamSatti",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#1a1a1a",
  "theme_color": "#4CAF50",
  "icons": [
    {
      "src": "icon-192.png",
      "sizes": "192x192",
      "type": "image/png"
    }
  ]
}
```

#### client/sw.js (Basic Service Worker)
```javascript
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open('badam-satti-v1').then((cache) => {
      return cache.addAll([
        '/',
        '/index.html',
        '/style.css',
        '/app.js',
        '/manifest.json'
      ]);
    })
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});
```

## Deployment (Super Easy)

### Option 1: Local Network (Immediate Testing)
```bash
# In server folder
npm install express socket.io
node index.js

# Share your computer's IP:3000 with family
# Works on same WiFi network
```

### Option 2: Free Hosting (Glitch.com)
1. Go to glitch.com
2. New Project → Import from GitHub
3. Paste your repo
4. Auto-deploys, get URL like `https://your-app.glitch.me`

### Option 3: Railway (Free Tier)
```bash
# Install Railway CLI
npm install -g @railway/cli

# Deploy
railway login
railway init
railway up
```

## Quick Start Commands
```bash
# Setup
mkdir badam-satti && cd badam-satti
mkdir server client

# Server
cd server
npm init -y
npm install express socket.io
# Copy the server code above

# Run
node index.js

# Open http://localhost:3000 in browser
```

## What This Gives You

1. **Zero Login** - Just enter name and play
2. **Works Everywhere** - Any device with a browser
3. **Easy Sharing** - Send link or room code
4. **Fast Development** - Can build in a weekend
5. **No App Store** - Updates instantly for everyone

## Next Steps for Claude Code

Tell Claude Code:
"Build a PWA for Badam Satti based on this spec. Start with the complete server implementation including all game logic, then create a simple but functional frontend. Focus on getting 4-player games working smoothly."

The key is keeping it simple - no database, no auth, just pure game logic and Socket.io.