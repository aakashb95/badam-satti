# Badam Satti Card Game - Implementation Documentation

## Project Overview
A complete multiplayer Progressive Web App (PWA) implementation of the Indian card game Badam Satti (variant of Sevens). Built with Node.js + Socket.io backend and React + TypeScript frontend.

## Architecture

### Server Side (`/server/`)
- **Express Server** (`index.js:3000`) - HTTP server with Socket.io integration
- **Game Logic** (`gameLogic.js`) - Complete game state management via GameRoom class
- **Socket Events** - Real-time multiplayer communication
- **Room Management** - 6-character room codes, auto-cleanup of empty rooms

### Client Side (`/client/`)
- **React 18 + TypeScript** - Modern component-based architecture
- **Vite Build System** - Fast development and optimized production builds
- **Progressive Web App** - Offline support, installable
- **Responsive Design** - Mobile-first approach for phones/tablets
- **Real-time Updates** - Socket.io client with auto-reconnection
- **Auto-play System** - 15-second countdown with random card selection
- **React Hooks** - State management with useState and useEffect

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
- **Card Redistribution**: Disconnected players' cards redistributed for fair, fast gameplay
- **Rate Limiting**: Spam protection (10 rooms/min, 20 joins/min per IP)
- **Round Continuation**: Players can continue to next round or exit with cumulative scores
- **Error Handling**: Comprehensive validation and user feedback
- **Health Monitoring**: `/health` and `/health/detailed` endpoints for system monitoring
- **PWA Support**: Full offline support with cache-first strategy, push notifications, background sync

## File Structure
```
/server/
  index.js         - Express server + Socket.io handlers + health check (serves React build)
  gameLogic.js     - GameRoom class + multi-round game logic
  database.js      - SQLite database layer for game persistence
  package.json     - Server dependencies (includes SQLite3, rate limiting)
  badam-satti.db   - SQLite database file (auto-created)

/client/
  src/
    components/    - React components for each game screen
      LoginScreen.tsx
      MenuScreen.tsx
      WaitingRoom.tsx
      GameScreen.tsx
      GameOverScreen.tsx
      LoadingScreen.tsx
      SummaryScreen.tsx
      ErrorModal.tsx
      Notification.tsx
    types/         - TypeScript type definitions
      index.ts     - Game state, card, player interfaces
    App.tsx        - Main React app with state management
    main.tsx       - React app entry point
    App.css        - Responsive styling (migrated from vanilla CSS)
    index.css      - Base styles
  public/
    manifest.json  - PWA configuration
    sw.js         - Service worker for offline support
    images/       - Complete SVG card set (52 cards + 2 jokers)
    favicon.ico   - Browser favicon
  dist/           - Production build output (served by server)
  index.html      - React app HTML template
  package.json    - React dependencies (React 18, TypeScript, Vite)
  vite.config.ts  - Vite build configuration
  tsconfig.json   - TypeScript configuration

/client-backup/   - Backup of original vanilla JS client
/
  badam-satti-spec.md - Original specification document
  card-preview.html   - Development tool for card design preview
```

## Key Implementation Details

### Socket Events
**Room Management:**
- `create_room` / `join_room` - Room creation and joining
- `get_state` - Request current game state

**Game Actions:**
- `start_game` - Begin gameplay (creator only)
- `play_card` / `pass_turn` - Game moves
- `continue_round` - Proceed to next round
- `exit_game` - Leave game and view cumulative scores

**System Events:**
- `player_disconnected` - Player removed, cards redistributed
- `cards_redistributed` - When player disconnects during game
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
- Auto-reconnection with exponential backoff (up to 5 attempts) for server connection only
- Disconnected players removed immediately for fair gameplay
- Fast game continuation via card redistribution
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

### React Client State (`App.tsx`)
- `appState` - Centralized application state including:
  - `gameState` - Server-synchronized game state
  - `myCards` - Player's hand
  - `validMoves` - Available plays
  - `isMyTurn` - Turn indicator
  - `currentScreen` - UI navigation state
  - `error`/`notification` - User feedback
- React hooks for auto-play timers and countdown management
- TypeScript interfaces for type safety

## Build and Testing Commands
```bash
# Build React app for production
cd client && npm run build

# Start server (serves React build from dist/)
cd server && node index.js

# Development mode (React dev server + proxy to backend)
cd client && npm run dev

# Open multiple browsers/devices to:
http://localhost:3000

# Test scenarios:
# - Create room from one device
# - Join from 2+ other devices
# - Start game with 4+ players
# - Test auto-play by waiting 15 seconds
# - Test disconnection/reconnection
# - Test responsive design on mobile
```

## Recent Enhancements
1. **React Migration** - Migrated frontend from vanilla JS to React 18 + TypeScript
2. **Modern Build System** - Vite for fast development and optimized production builds
3. **Component Architecture** - Modular React components for each game screen
4. **Type Safety** - Full TypeScript implementation with comprehensive interfaces
5. **Game Persistence** - SQLite database ensures zero data loss on server restart
6. **Card Redistribution** - Immediate card redistribution maintains fair, fast gameplay
7. **Rate Limiting** - Spam protection with IP-based throttling
8. **Health Monitoring** - Comprehensive `/health` and `/health/detailed` endpoints
9. **Multi-Round System** - Complete 7-round gameplay with cumulative scoring
10. **Auto-play Feature** - 15-second countdown with random card selection (client-side) - **FIXED**
11. **Round Continuation** - Players can continue or exit after each round
12. **Enhanced PWA** - Full offline support with cache-first strategy
13. **Graceful Shutdown** - All active games saved to database on server shutdown
14. **Auto-play Fix** - Resolved stale closure issue preventing auto-play from working
15. **Game Ending Fix** - Fixed multiple game ending triggers and empty score displays
16. **Game Over UX Improvements** - 2-second delay with animated "Game Over" screen before scoring
17. **Remaining Cards Display** - Visual mini-cards showing what each player had left
18. **Enhanced Winner Highlighting** - Clean green gradient with "WINNER" badge (removed bouncing)
19. **Improved Button Spacing** - Added proper spacing between Continue/Exit game buttons
20. **Visual Card Display** - Replaced text/emoji with actual SVG card images in scoring
21. **7♥ Starter Logic Fix** - Player who gets 7♥ auto-played skips their next turn for fairness
22. **Game Start Message** - Shows "Player X started the game" notification in UI
23. **Enhanced Card Shuffling** - Multi-pass Fisher-Yates + riffle shuffle simulation for proper randomization
24. **Connection Stability Fix** - Resolved socket reconnection loop that caused frequent "Not connected to server" pop-ups (implemented by o3)

## Known Working Features
- ✅ **React Frontend** - Modern component-based architecture with TypeScript
- ✅ **Vite Build System** - Fast development and optimized production builds  
- ✅ Room creation and joining (2-11 players)
- ✅ Multi-round gameplay (up to 7 rounds)
- ✅ Complete game logic with auto-start (7♥)
- ✅ Real-time multiplayer synchronization
- ✅ Auto-play with 15-second countdown
- ✅ Game persistence through server restarts
- ✅ Fast card redistribution on player disconnect
- ✅ Rate limiting and spam protection
- ✅ Round continuation and exit system
- ✅ Cumulative scoring across rounds
- ✅ Mobile responsive design
- ✅ Full PWA with offline support
- ✅ Comprehensive health monitoring
- ✅ Graceful shutdown handling
- ✅ **Type Safety** - Full TypeScript implementation
- ✅ **Game Ending Logic** - Proper winner/score display and single game termination
- ✅ **Enhanced Game Over Flow** - 2-second animation + visual card display + clean winner highlighting
- ✅ **Professional UI/UX** - Improved spacing, visual cards, and polished game ending experience
- ✅ **Fair 7♥ Starter** - Auto-played 7♥ player skips next turn to prevent double advantage
- ✅ **Game Start Notifications** - Clear indication of who started each round
- ✅ **True Card Randomization** - Multi-pass shuffling eliminates sequence patterns

## Development Notes
- **Frontend**: React 18 + TypeScript with Vite build system
- **Backend**: Node.js + Express + Socket.io (unchanged)
- Socket.io timeout: 60s ping timeout, 25s ping interval
- Auto-play triggers after exactly 15 seconds of inactivity (client-side only)
- Random move selection uses `Math.random()` for fair play
- SQLite database with complete game state persistence
- Rate limiting: 10 room creates/min, 20 joins/min per IP
- Service worker implements cache-first strategy for offline support
- Game state fully synchronized across all connected clients
- Room cleanup runs every 60 seconds (database + memory)
- Graceful shutdown saves all active games to database
- Disconnected players immediately removed with card redistribution
- Complete SVG card set with custom design
- Sophisticated card sorting: hearts, diamonds, clubs, spades by rank
- Server auto-plays 7♥ to start each round
- **Game Ending**: Single termination with proper winner/score display
- **Production**: Server serves React build from `/client/dist/`
- **Development**: Use `npm run dev` in client for hot reloading

## File Locations
- Main server: `/Users/aakash/expts/badam7/server/index.js`
- Game logic: `/Users/aakash/expts/badam7/server/gameLogic.js`
- Database layer: `/Users/aakash/expts/badam7/server/database.js`
- SQLite database: `/Users/aakash/expts/badam7/server/badam-satti.db`
- **React App**: `/Users/aakash/expts/badam7/client/src/App.tsx`
- **React Components**: `/Users/aakash/expts/badam7/client/src/components/`
- **TypeScript Types**: `/Users/aakash/expts/badam7/client/src/types/index.ts`
- **Build Output**: `/Users/aakash/expts/badam7/client/dist/`
- **Legacy Backup**: `/Users/aakash/expts/badam7/client-backup/` (original vanilla JS)

---
*Last Updated: 2025-07-08*
*Status: Production-ready with React frontend, TypeScript, SQLite persistence, rate limiting, robust reconnection (socket stability fix by o3), working auto-play, enhanced game over UX with visual cards, professional winner highlighting, fair 7♥ starter logic, and true card randomization*