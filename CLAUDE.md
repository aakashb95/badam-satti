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
25. **Mobile UX Improvements** - Enhanced card display for mobile devices:
    - Removed horizontal scrolling to prevent left swipe back button conflicts
    - Implemented 2x2 grid layout for card suits (hearts/diamonds top, clubs/spades bottom)
    - Moved card count from header to cards section for better information hierarchy
    - Increased card overlap for space efficiency while maintaining readability
    - Consolidated .board-card-img styles to consistent 50px width across all screen sizes
26. **Board Card Stacking Optimization** - Improved board space efficiency:
    - Reduced MAX_VISIBLE_CARDS from 6 to 3 to trigger stacking earlier
    - Board cards now stack immediately when 8/6 are played (3+ cards in sequence)
    - Prevents board overlap with player's hand area on mobile devices
    - Maintains key card visibility with ellipsis indicator for hidden cards
27. **Desktop Interface Fixes** - Enhanced desktop user experience:
    - Fixed top bar positioning with higher z-index (9999) and proper spacing
    - Added desktop-specific styling with larger buttons and typography
    - Implemented content padding to prevent overlap with fixed header
    - Enhanced background opacity and blur effects for better visibility
28. **Board Stacking Logic Fix** - Resolved duplicate card display issue:
    - Fixed 7 card showing twice in stacked sequences
    - Improved sequence building to properly include 7 in card order
    - Updated display logic to show actual highest/middle/lowest cards
    - Maintains accurate card representation in compressed view
29. **Duplicate 7♥ Display Fix** - Fixed board rendering showing two 7 of hearts:
    - Removed manual addition of 7 to card sequences in GameScreen.tsx:107
    - Server already includes 7 in board state when auto-played at game start
    - Fixed frontend from duplicating the 7 card in board display logic
30. **SVG Card Optimization** - Optimized card assets for faster loading:
    - Reduced total card size from 8.0MB to 5.2MB (35% reduction)
    - Optimized face cards from 400KB-1.1MB to 260KB-742KB each
    - Used svgo with multipass optimization to remove metadata
    - Maintained visual quality while improving performance
31. **CDN Integration** - Implemented Cloudflare CDN for global asset delivery:
    - Added badam7.aakashb.xyz domain to Cloudflare with proxied DNS
    - Configured Page Rules for /images/* with Cache Everything and 1-year TTL
    - Enabled HTTP/2 and global edge caching for card images
    - Achieved faster loading for international users and reduced server load
32. **Mobile App Switching Persistence** - Enhanced connection stability for mobile:
    - Increased socket timeout from 60s to 120s for mobile app switching
    - Added Page Visibility API to detect app switching and reconnect automatically
    - Improved disconnect handling to not show errors during app switching
    - Added room state recovery when reconnecting after app switch
    - More lenient reconnection attempts (10 vs 5) for mobile networks
33. **Pre-Game Reconnection System** - Complete reconnection solution for waiting rooms:
    - Added SQLite-based player session tracking with reconnection timeouts
    - Players can reconnect to waiting rooms for 10 minutes after disconnect
    - Automatic reconnection attempts when returning to app during waiting phase
    - Manual reconnection UI with "Reconnect to Room" button in menu
    - Phase-aware disconnect handling: reconnection in waiting, immediate removal in game
    - Database schema enhancement with `disconnected_at`, `can_reconnect`, `reconnect_timeout`
    - Room cleanup preservation for reconnectable players
34. **Server-Side Player Indicators** - Clean turn-agnostic position analysis system:
    - **🟡 Yellow Warning**: Players with 3 cards or less (risky position)
    - **🔴 Red Critical**: Players where ALL remaining cards are immediately playable on current board (sure win)
    - **Turn-Agnostic Logic**: Red indicators show instantly when cards become playable, regardless of whose turn it is
    - **Clean UI**: Color-only indicators without cluttered text for optimal UX
    - Server-side calculation ensures consistent, accurate indicators for all players
    - Real-time analysis based on actual player cards and current board state
    - Enhanced strategic visibility with animated visual effects
35. **Pre-Game Help System** - User-friendly help access from menu screen:
    - **📋 Help Button**: Blue "How to Play" button in MenuScreen (join room screen)
    - **Distinct Styling**: Blue (#2196F3) button with hover effects for clear differentiation
    - **Strategic Placement**: Positioned prominently in menu after welcome message
    - **Modal Integration**: Uses existing HelpModal component for consistent UI/UX
    - **Accessibility**: Easy access to game rules before joining or creating rooms
36. **Smart Card Stacking Logic** - Intelligent board space optimization with proper sequence display:
    - **Edge Case Handling**: Correctly handles one-direction sequences (only up/down from 7)
    - **7-Centered Stacking**: 7 card always appears in center position when 3+ cards stacked
    - **Sequence-Aware Display**: Shows 7+highest for upward-only, 7+lowest for downward-only
    - **Mixed Sequence Logic**: Displays highest+7+lowest for bidirectional sequences
    - **Visual Accuracy**: Eliminates confusion by showing actual card positions in stacks
37. **Enhanced Auto-Play Timing** - Extended countdown for better user experience:
    - **20-Second Timer**: Increased from 15 seconds to provide more thinking time
    - **Visual Countdown**: Real-time timer display in both top bar and game UI
    - **Auto-Pass Integration**: Seamless transition to auto-pass when no valid moves available
    - **Consistent Timing**: Server and client-side timing perfectly synchronized
38. **Fixed Card Hover States** - Resolved stuck card highlighting on touch devices:
    - **Touch Device Detection**: CSS media queries prevent hover states on touch screens
    - **Programmatic Reset**: Click-outside handler resets stuck card transforms
    - **Cross-Platform Compatibility**: Proper hover behavior on desktop, clean touch on mobile
    - **Visual Feedback**: Smooth transitions without persistent highlighting issues
39. **Optimized Desktop Layout** - Balanced proportions for desktop gaming experience:
    - **Responsive Card Sizing**: Larger cards (70px) for desktop visibility without overwhelming
    - **Compact Players Info**: Horizontal layout with reduced padding for space efficiency
    - **Proper Space Distribution**: Game board (280px) and hand cards (120px) fit viewport
    - **Typography Scaling**: Enhanced readability with appropriate font sizes for desktop
40. **Clean Turn Information UX** - Eliminated information overload in game interface:
    - **Simplified Top Bar**: Removed redundant turn display, shows only timer when active
    - **Context-Aware Labels**: "Your Turn" vs "Current Turn" based on player perspective
    - **Single Source of Truth**: Current player indicator is primary turn information
    - **Reduced Cognitive Load**: Clear, non-duplicated turn status throughout interface
41. **Enhanced Card Playability Detection** - Fixed server-side indicator logic for red critical warnings:
    - **Fixed Edge Cases**: Corrected `isCardPlayableOnBoard()` logic to properly detect all playable cards
    - **7-Based Sequences**: Added special handling for 6 and 8 cards when 7 is the only card played
    - **Accurate Critical Indicators**: Red warnings now correctly appear when all remaining cards are playable
    - **Turn-Agnostic Analysis**: Real-time position analysis updates instantly as board state changes
42. **Toast Notification System** - Replaced alert popups with clean toast notifications:
    - **Copy Room Code**: Replaced browser alert with elegant toast notification
    - **Consistent UX**: Uses existing notification system for seamless user experience
    - **Non-Intrusive**: Toast notifications don't interrupt gameplay flow
    - **Cross-Platform**: Works consistently across all devices and browsers
43. **Simplified Player Card Display** - Clean numeric-only card counts for non-active players:
    - **Minimalist Design**: Removed "cards" suffix for other players, showing just numbers
    - **Context-Aware**: Current player still shows "X cards" for clarity
    - **Reduced Clutter**: Cleaner UI with essential information only
    - **Visual Hierarchy**: Clear distinction between active and inactive players
44. **Refined Visual Indicators** - Streamlined warning system with color-only approach:
    - **Removed Emoji Dots**: Eliminated redundant 🟡/🔴 emojis from player indicators
    - **Background Color Focus**: Warning levels shown through background colors only
    - **Clean Aesthetic**: Reduced visual noise while maintaining functionality
    - **Consistent Design**: Uniform indicator system across all player displays
45. **Fixed Card Stacking Edge Cases** - Corrected sequence detection for proper 7-centered stacking:
    - **Downward-Only Fix**: Properly detects 7,6,5,4 sequences as downward-only (not mixed)
    - **Upward-Only Logic**: Correctly handles 7,8,9,10 sequences with proper card display
    - **7-Centered Display**: Ensures 7 always appears in center position for both sequence types
    - **Edge Case Handling**: Fixed logic to distinguish between mixed and single-direction sequences
46. **Critical Security Hardening** - Comprehensive security vulnerability fixes (2025-07-10):
    - **CORS Protection**: Restricted origins to specific allowed domains (localhost, production domain)
    - **IP Privacy**: Implemented IP address hashing with crypto.createHash() for user privacy
    - **Security Headers**: Added Helmet.js with CSP, HSTS, and anti-clickjacking protection
    - **HTTPS Enforcement**: Automatic HTTPS redirection in production environment
    - **Health Endpoint Security**: Removed sensitive data exposure (PID, memory details, room codes)
    - **Admin Authentication**: Added `/health/admin` endpoint with API key authentication
    - **Error Sanitization**: Implemented error message sanitization to prevent information disclosure
    - **Rate Limiting Enhancement**: Updated rate limiting to use hashed IPs instead of raw addresses

## Known Working Features
- ✅ **React Frontend** - Modern component-based architecture with TypeScript
- ✅ **Vite Build System** - Fast development and optimized production builds  
- ✅ Room creation and joining (2-11 players)
- ✅ Multi-round gameplay (up to 7 rounds)
- ✅ Complete game logic with auto-start (7♥)
- ✅ Real-time multiplayer synchronization
- ✅ Auto-play with 20-second countdown
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
- ✅ **Optimized Mobile Card Display** - 2x2 grid layout with no scrolling, increased overlap, responsive design
- ✅ **Compact Board Layout** - Early card stacking (3+ cards) prevents overlap with player hands
- ✅ **Cross-Platform Interface** - Responsive design with optimized mobile and desktop experiences
- ✅ **Accurate Card Stacking** - Fixed duplicate card display in compressed board view
- ✅ **Clean Board Display** - Eliminated duplicate 7♥ rendering on game board
- ✅ **Optimized Card Assets** - 35% smaller SVG files (8.0MB → 5.2MB) with maintained quality
- ✅ **CDN Performance** - Cloudflare global edge caching with 1-year TTL for instant loading
- ✅ **Mobile App Switching** - Persistent connections when switching between apps/tabs
- ✅ **Pre-Game Reconnection** - 10-minute reconnection window for waiting room disconnections
- ✅ **Server-Side Player Indicators** - Clean turn-agnostic color warnings (yellow/red) with optimal UX
- ✅ **Pre-Game Help System** - Blue "How to Play" button in menu screen with modal integration
- ✅ **Smart Card Stacking Logic** - Intelligent 7-centered stacking with proper edge case handling
- ✅ **Enhanced Auto-Play Timing** - 20-second countdown with visual feedback and touch-friendly card states
- ✅ **Optimized Desktop Layout** - Balanced proportions with proper card visibility and space distribution
- ✅ **Clean Turn Information UX** - Simplified interface eliminating information overload
- ✅ **Enhanced Card Playability Detection** - Fixed server-side red indicator logic for accurate critical warnings
- ✅ **Toast Notification System** - Replaced alert popups with elegant toast notifications for room code copying
- ✅ **Simplified Player Card Display** - Clean numeric-only counts for non-active players with context-aware labeling
- ✅ **Refined Visual Indicators** - Streamlined color-only warning system without redundant emoji dots
- ✅ **Fixed Card Stacking Edge Cases** - Proper 7-centered stacking with accurate sequence direction detection
- ✅ **Critical Security Hardening** - CORS protection, IP hashing, security headers, HTTPS enforcement, secure health endpoints

## Development Notes
- **Frontend**: React 18 + TypeScript with Vite build system
- **Backend**: Node.js + Express + Socket.io (unchanged)
- Socket.io timeout: 60s ping timeout, 25s ping interval
- Auto-play triggers after exactly 20 seconds of inactivity (client-side only)
- Random move selection uses `Math.random()` for fair play
- SQLite database with complete game state persistence
- Rate limiting: 10 room creates/min, 20 joins/min per IP
- Service worker implements cache-first strategy for offline support
- Game state fully synchronized across all connected clients
- Room cleanup runs every 60 seconds (database + memory)
- Graceful shutdown saves all active games to database
- Disconnected players immediately removed with card redistribution
- Complete SVG card set with custom design (optimized to 5.2MB total)
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
- **Menu Screen**: `/Users/aakash/expts/badam7/client/src/components/MenuScreen.tsx`
- **TypeScript Types**: `/Users/aakash/expts/badam7/client/src/types/index.ts`
- **Build Output**: `/Users/aakash/expts/badam7/client/dist/`
- **Legacy Backup**: `/Users/aakash/expts/badam7/client-backup/` (original vanilla JS)

## TODO/Deferred

### Error Handling Improvements (2025-07-09)
**Issue**: Current "room not found" error handling uses brittle text matching
- **Current**: `message.toLowerCase().includes('room not found')`
- **Problems**: Case sensitivity, exact wording dependency, i18n issues, false positives
- **Better Solutions**: 
  - Error codes: `{ type: 'ROOM_NOT_FOUND', message: '...' }`
  - Separate events: `socket.emit('room_not_found', { roomCode, message })`
  - HTTP-style status codes for error categorization
- **Risk**: Server message changes break error handling, causing infinite loading
- **Priority**: Medium (works for now, but fragile)

### Additional Security Enhancements (Future)
**Medium Priority Security Items:**
- **Database File Permissions**: Set restrictive permissions on `badam-satti.db` (600 or 640)
- **Input Sanitization**: Add comprehensive input validation for all user inputs
- **Socket Event Rate Limiting**: Implement rate limiting on socket events (play_card, etc.)
- **Session Management**: Implement proper session tokens instead of socket IDs
- **Logging Security**: Implement secure logging with log rotation and sanitization
- **Dependency Scanning**: Regular automated dependency vulnerability scanning
- **Environment Variables**: Move sensitive config to environment variables (.env file)

**Low Priority Security Items:**
- **Content Security Policy Enhancement**: Fine-tune CSP for tighter security
- **Request Size Limiting**: Add body parser limits for DoS protection
- **Brute Force Protection**: Enhanced protection for repeated invalid requests
- **Security Headers Testing**: Regular security header validation testing
- **Penetration Testing**: Professional security assessment
- **SSL Certificate Automation**: Automated certificate renewal (Let's Encrypt)

### Development Environment Security
**Items to Consider:**
- **Development HTTPS**: Local HTTPS setup for development environment
- **Environment Separation**: Ensure dev/staging/prod environment isolation
- **Secret Management**: Implement proper secret management system
- **Access Control**: Role-based access control for admin functions
- **Audit Logging**: Comprehensive audit trail for admin actions
- **Backup Security**: Encrypted database backups with secure storage

---
*Last Updated: 2025-07-10*
*Status: Production-ready with React frontend, TypeScript, SQLite persistence, rate limiting, robust reconnection (socket stability fix by o3), working auto-play (20s), enhanced game over UX with visual cards, professional winner highlighting, fair 7♥ starter logic, true card randomization, optimized mobile card display with 2x2 grid layout, compact board stacking, cross-platform desktop/mobile interface, accurate card sequence display, clean board rendering without duplicate 7♥, optimized SVG card assets (35% smaller), Cloudflare CDN integration for global performance, clean turn-agnostic server-side player position indicators with fixed red critical detection, pre-game help system with blue "How to Play" button, smart 7-centered card stacking with proper edge case handling, fixed touch device card hover states, optimized desktop layout with balanced proportions, clean turn information UX eliminating information overload, toast notification system replacing alert popups, simplified numeric-only player card displays, refined color-only visual indicators, fixed card stacking edge cases for accurate sequence direction detection, and critical security hardening with CORS protection, IP privacy, security headers, HTTPS enforcement, and secure health endpoints*