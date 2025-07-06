# Badam Satti Card Game - Implementation Documentation

## Project Overview
A complete multiplayer Progressive Web App (PWA) implementation of the Indian card game Badam Satti (variant of Sevens). Built with Node.js + Socket.io backend and vanilla HTML/CSS/JS frontend.

## Architecture

### Server Side (`/server/`)
- **Express Server** (`index.js:3000`) - HTTP server with Socket.io integration
- **Game Logic** (`gameLogic.js`) - Complete game state management via GameRoom class
- **Socket Events** - Real-time multiplayer communication
- **Room Management** - 6-character room codes, auto-cleanup of empty rooms

### Client Side (`/client/`)
- **Progressive Web App** - Offline support, installable
- **Responsive Design** - Mobile-first approach for phones/tablets
- **Real-time Updates** - Socket.io client with auto-reconnection
- **Auto-play System** - 15-second countdown with random card selection

## Game Features

### Core Gameplay
- **Players**: 2-11 players per room
- **Starting Card**: 7 of hearts must be played first (auto-played by server)
- **Sequence Building**: Play adjacent ranks in same suit (6♥ → 7♥ → 8♥)
- **Passing**: Auto-pass when no valid moves available
- **Multi-Round System**: 7 rounds maximum with cumulative scoring
- **Scoring**: Points based on remaining cards (A=1, J=11, Q=12, K=13, numbers=face value)

### Technical Features
- **Auto-play**: Random card selection after 15 seconds of inactivity (client-side only)
- **Game Persistence**: SQLite database ensures games survive server restarts
- **Smart Reconnection**: Disconnected players preserved in game, can rejoin seamlessly
- **Rate Limiting**: Spam protection (10 rooms/min, 20 joins/min per IP)
- **Round Continuation**: Players can continue to next round or exit with cumulative scores
- **Error Handling**: Comprehensive validation and user feedback
- **Health Monitoring**: `/health` and `/health/detailed` endpoints for system monitoring
- **PWA Support**: Full offline support with cache-first strategy, push notifications, background sync

## File Structure
```
/server/
  index.js         - Express server + Socket.io handlers + health check
  gameLogic.js     - GameRoom class + multi-round game logic
  database.js      - SQLite database layer for game persistence
  package.json     - Server dependencies (includes SQLite3, rate limiting)
  badam-satti.db   - SQLite database file (auto-created)

/client/
  index.html       - Multi-screen UI structure
  app.js           - Client game logic + socket handling
  style.css        - Responsive styling
  manifest.json    - PWA configuration
  sw.js           - Service worker for offline support
  images/cards/    - Complete SVG card set (52 cards + 2 jokers)
  images/icon.svg  - App icon source
  favicon.ico      - Browser favicon

/
  badam-satti-spec.md - Original specification document
  card-preview.html   - Development tool for card design preview
```

## Key Implementation Details

### Socket Events
**Room Management:**
- `create_room` / `join_room` - Room creation and joining
- `get_state` - Request current game state
- `reconnect_player` - Rejoin with existing username

**Game Actions:**
- `start_game` - Begin gameplay (creator only)
- `play_card` / `pass_turn` - Game moves
- `continue_round` - Proceed to next round
- `exit_game` - Leave game and view cumulative scores

**System Events:**
- `player_disconnected` / `player_reconnected` - Connection handling
- `cards_redistributed` - When player disconnects
- `round_continued` - Round transition
- `game_totals` - Final cumulative scores

### Auto-play System
- 15-second countdown timer with visual feedback
- Random valid move selection using `Math.random()`
- Auto-pass when no moves available
- Client-side only (no server-side auto-play)
- Countdown display shows remaining time in turn indicator

### Connection Management
- Socket timeout: 60 seconds ping timeout, 25 seconds ping interval
- Auto-reconnection with exponential backoff (up to 5 attempts)
- Smart reconnection preserves player state in active games
- State synchronization on reconnect with database restoration
- Offline/online event handling

## Game State Management

### GameRoom Class (`gameLogic.js`)
```javascript
class GameRoom {
  constructor(roomCode) {
    this.roomCode = roomCode;
    this.players = []; // Each player has totalScore, connected status
    this.board = { hearts: {up: [], down: []}, diamonds: {up: [], down: []}, clubs: {up: [], down: []}, spades: {up: [], down: []} };
    this.currentPlayerIndex = 0;
    this.round = 1;
    this.maxRounds = 7;
    this.started = false;
    this.roundsPlayed = 0;
  }
}
```

### Client State (`app.js`)
- `gameState` - Server-synchronized game state
- `myCards` - Player's hand
- `validMoves` - Available plays
- `isMyTurn` - Turn indicator
- Auto-play timers and countdown management

## Testing Commands
```bash
# Start server
cd server && node index.js

# Open multiple browsers/devices to:
http://localhost:3000

# Test scenarios:
# - Create room from one device
# - Join from 2+ other devices
# - Start game with 4+ players
# - Test auto-play by waiting 10 seconds
# - Test disconnection/reconnection
```

## Recent Enhancements
1. **Game Persistence** - SQLite database ensures zero data loss on server restart
2. **Smart Reconnection** - Disconnected players preserved in game, seamless rejoin
3. **Rate Limiting** - Spam protection with IP-based throttling
4. **Health Monitoring** - Comprehensive `/health` and `/health/detailed` endpoints
5. **Multi-Round System** - Complete 7-round gameplay with cumulative scoring
6. **Auto-play Feature** - 15-second countdown with random card selection (client-side)
7. **Round Continuation** - Players can continue or exit after each round
8. **Enhanced PWA** - Full offline support with cache-first strategy
9. **Graceful Shutdown** - All active games saved to database on server shutdown

## Known Working Features
- ✅ Room creation and joining (2-11 players)
- ✅ Multi-round gameplay (up to 7 rounds)
- ✅ Complete game logic with auto-start (7♥)
- ✅ Real-time multiplayer synchronization
- ✅ Auto-play with 15-second countdown
- ✅ Game persistence through server restarts
- ✅ Smart reconnection (players preserved during disconnect)
- ✅ Rate limiting and spam protection
- ✅ Round continuation and exit system
- ✅ Cumulative scoring across rounds
- ✅ Mobile responsive design
- ✅ Full PWA with offline support
- ✅ Comprehensive health monitoring
- ✅ Graceful shutdown handling

## Development Notes
- Socket.io timeout: 60s ping timeout, 25s ping interval
- Auto-play triggers after exactly 15 seconds of inactivity (client-side only)
- Random move selection uses `Math.random()` for fair play
- SQLite database with complete game state persistence
- Rate limiting: 10 room creates/min, 20 joins/min per IP
- Service worker implements cache-first strategy for offline support
- Game state fully synchronized across all connected clients
- Room cleanup runs every 60 seconds (database + memory)
- Graceful shutdown saves all active games to database
- Smart reconnection preserves player state during disconnects
- Complete SVG card set with custom design
- Sophisticated card sorting: hearts, diamonds, clubs, spades by rank
- Server auto-plays 7♥ to start each round

## File Locations
- Main server: `/Users/aakash/expts/badam7/server/index.js`
- Game logic: `/Users/aakash/expts/badam7/server/gameLogic.js`
- Database layer: `/Users/aakash/expts/badam7/server/database.js`
- SQLite database: `/Users/aakash/expts/badam7/server/badam-satti.db`
- Client app: `/Users/aakash/expts/badam7/client/app.js`
- HTML interface: `/Users/aakash/expts/badam7/client/index.html`
- Styling: `/Users/aakash/expts/badam7/client/style.css`

---
*Last Updated: 2025-07-06*
*Status: Production-ready with SQLite persistence, rate limiting, and robust reconnection*