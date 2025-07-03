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
- **Players**: 4-11 players per room
- **Starting Card**: 7 of hearts must be played first
- **Sequence Building**: Play adjacent ranks in same suit (6♥ → 7♥ → 8♥)
- **Passing**: Auto-pass when no valid moves available
- **Scoring**: Points based on remaining cards when someone wins

### Technical Features
- **Auto-play**: Random card selection after 15 seconds of inactivity
- **Disconnection Handling**: Auto-play for disconnected players
- **Reconnection**: Players can rejoin with same username
- **Error Handling**: Comprehensive validation and user feedback
- **PWA Support**: Service worker, manifest, offline capabilities

## File Structure
```
/server/
  index.js         - Express server + Socket.io handlers
  gameLogic.js     - GameRoom class + game logic
  package.json     - Server dependencies

/client/
  index.html       - Multi-screen UI structure
  app.js           - Client game logic + socket handling
  style.css        - Responsive styling
  manifest.json    - PWA configuration
  sw.js           - Service worker for offline support
  images/         - App icons and assets
```

## Key Implementation Details

### Socket Events
- `create_room` / `join_room` - Room management
- `start_game` - Begin gameplay (creator only)
- `play_card` / `pass_turn` - Game actions
- `player_disconnected` / `player_reconnected` - Connection handling

### Auto-play System
- 15-second countdown timer with visual feedback
- Random valid move selection
- Auto-pass when no moves available
- Applies to both disconnected players and idle players

### Connection Management
- Socket timeout: 60 seconds ping timeout, 25 seconds ping interval
- Auto-reconnection with exponential backoff
- State synchronization on reconnect
- Offline/online event handling

## Game State Management

### GameRoom Class (`gameLogic.js`)
```javascript
class GameRoom {
  constructor(roomCode) {
    this.roomCode = roomCode;
    this.players = [];
    this.board = { hearts: {up: [], down: []}, ... };
    this.currentPlayerIndex = 0;
    this.round = 1;
    this.maxRounds = 5;
    this.started = false;
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
# - Test auto-play by waiting 15 seconds
# - Test disconnection/reconnection
```

## Recent Enhancements
1. **Auto-play Feature** - Added 15-second countdown with random card selection
2. **Increased Timeouts** - Socket ping timeout: 60s, interval: 25s
3. **Disconnection Auto-play** - Server auto-plays for disconnected players
4. **Visual Feedback** - Countdown timer shown to players
5. **Enhanced Error Handling** - Better connection state validation

## Known Working Features
- ✅ Room creation and joining
- ✅ 4-11 player support
- ✅ Complete game logic implementation
- ✅ Real-time multiplayer synchronization
- ✅ Auto-play and auto-pass functionality
- ✅ Mobile responsive design
- ✅ PWA offline support
- ✅ Reconnection handling

## Development Notes
- All Socket.io timeout values increased for stability
- Auto-play triggers after exactly 15 seconds of inactivity
- Random move selection uses `Math.random()` for fair play
- Service worker caches all static assets for offline use
- Game state fully synchronized across all connected clients

## File Locations
- Main server: `/Users/aakash/expts/badam7/server/index.js`
- Game logic: `/Users/aakash/expts/badam7/server/gameLogic.js`
- Client app: `/Users/aakash/expts/badam7/client/app.js`
- HTML interface: `/Users/aakash/expts/badam7/client/index.html`
- Styling: `/Users/aakash/expts/badam7/client/style.css`

---
*Last Updated: 2025-07-03*
*Status: Fully functional, ready for deployment*