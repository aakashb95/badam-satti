# Badam Satti (Badam 7) — Project Guide

Read `PRODUCT_PRINCIPLES.md` before changing gameplay, cards, layout, timers, player state, or connection behavior. Its rules are product requirements and acceptance criteria.

Multiplayer PWA for the Indian card game Badam Satti (Sevens). Node.js +
Socket.io backend, React 18 + TypeScript + Vite frontend, SQLite persistence.
This repo also hosts a small static landing page and a second game,
King's Corner.

## Repository layout

- `server/` — Express + Socket.io server (`index.js`), game rules
  (`gameLogic.js`), SQLite layer (`database.js`), tests in `server/test/`.
- `client/` — Badam React app. Vite `base` is `/badam7/`; the router basename
  matches. Shared card helpers (asset version, filenames, `SuitIcon`) live in
  `client/src/cards.tsx`. Playwright e2e in `client/e2e/`.
- `client/src/sounds.ts` — table sounds. Dealing and playing a card are
  recordings in `client/public/sounds/` (the 4.6s deal is faded out after 2s);
  the pass knock and winner chimes are synthesised with the Web Audio API.
  Round and game winner sounds play only for the winning player. Everything
  runs through one master gain, stays silent while the tab is hidden or when
  the player turns sound off (`badam-satti-sound` in localStorage), and the
  context is unlocked (and samples warmed) on the first tap. Adding or
  replacing an mp3 means bumping the cache names in `client/public/sw.js`,
  which precaches them.
- `client/src/music.ts` — optional background music. Six tracks in
  `client/public/music/` play in order, starting with Shanghai, at 20% volume
  by default. Players can change and save the music volume from the sound menu.
  Music has its own saved setting (`badam-satti-background-music`), starts only
  after a player enables it, pauses while the tab is hidden, and continues
  across the waiting room and game screens. The tracks load one at a time and
  are not part of the service worker app shell.
- `client/public/images/cards/` — 52 generated SVG card faces. Regenerate with
  `node client/scripts/generate-cards.mjs`; keep pip paths in sync with
  `client/src/cards.tsx` and bump `CARD_ASSET_VERSION` there plus the cache
  names in `client/public/sw.js`. Visual check: `/badam7/card-preview.html`.
- `landing/` — static game chooser served at `/`.
- `kings-corner/` — separate game, proxied under `/kings-corner` (see
  `deploy/ROUTING.md` for production routing and path rules).

## Game rules encoded in gameLogic.js

- 3–11 players. All 52 cards dealt; with uneven division some players get one
  extra card (`dealtCardCount` per player in state).
- Dealing is clockwise from the seat after the dealer; hands are dealt sorted
  (hearts, diamonds, clubs, spades, ascending rank — `sortHand`).
- Server auto-plays 7♥ to open each round; that player's next turn is skipped
  by normal rotation. Up to 7 rounds, cumulative scoring
  (A=1, J=11, Q=12, K=13, numbers face value; lowest total wins).
- Dealer for the next round = highest scorer of the finished round.
- Player indicators in state: `warning` (≤3 cards), `critical` (every
  remaining card is playable on the current board).
- Playing a card uses select then confirm: tapping an eligible card selects it
  with a stronger outline but does not lift or enlarge it again, and tapping
  the central Play button sends the move. Every opaque card face has an upright
  rank and suit in both the top-left and bottom-right corners. Overlapping cards
  naturally hide the covered artwork. Selecting another card changes the choice
  without accidentally sending the first one.
- Round results say "You won!" to the winner and show confetti only on that
  player's screen. Other players see the winner's name without confetti. The
  overall winner sees a light fireworks effect on the final standings screen.
- After Next round, a five-second summary builds one row at a time. It shows
  the highest scorer who deals, the player who received 7♥, and every player
  who received an extra card. Earlier rows stay visible while the next row
  appears.

## Turn timing (server-authoritative)

- `GameRoom.turnDurationSeconds` (20 default; host may set 20/40/60 in the
  waiting room via `set_turn_duration`). `turnStartedAt` +
  `turnDurationSeconds` are in every `getState()` so all clients can render
  the countdown for whoever is playing.
- `server/index.js` keeps one timer per room (`activeTurnTimers`). On expiry
  the server plays the valid card farthest from 7 (or passes) for the current
  player, broadcasting the same `card_played` / `turn_passed` events as a
  human move with `automatic: true`. Timers restart on every turn advance and
  on room restore; they are cleared on round end, room cleanup, and shutdown.
- The client countdown is display-only. It never emits moves.
- Timers are disabled when `NODE_ENV=test` unless `ENABLE_TURN_TIMERS=1`
  (`TURN_TIMER_TEST_DELAY_MS` shortens expiry in tests).

## Socket contract

Client → server: `create_room(username)`, `join_room({roomCode, username})`,
`reconnect_to_room({roomCode, username, sessionToken})`, `start_game` (host
only, ≥3 connected players), `set_turn_duration(seconds)` (host only, before start),
`play_card(card)`, `pass_turn`, `continue_round`, `exit_game` (host only),
`leave_room(ack?)`, `get_state`.

Server → client: `room_created`, `room_joined`, `room_reconnected` (all three
include the player's private `sessionToken`),
`player_joined`, `player_reconnected`, `player_disconnected`,
`player_temporarily_disconnected`, `game_started`, `your_cards({cards,
validMoves, canPass})`, `card_played({playerName, card, gameState, automatic?})`,
`turn_passed({playerName, gameState, automatic?})`,
`turn_duration_changed({turnDurationSeconds, gameState})`, `game_over(winner)`,
`round_continued({gameState})`, `cards_redistributed({message})`,
`not_enough_players({message, gameState})`, `game_totals`, `left_room`,
`game_state`, `game_abandoned({message, recoveryFailure?})`, and `error` (string or
`{code, message}`; codes include `ROOM_NOT_FOUND`, `USERNAME_TAKEN`,
`GAME_ALREADY_STARTED`, `HOST_ONLY`, `NOT_ENOUGH_CONNECTED_PLAYERS`,
`PLAYERS_RECONNECTING`, `RECONNECT_REQUIRED`, `RECONNECT_UNAVAILABLE`).

A duplicate `continue_round` (two players tapping "Next round") resyncs the
late caller into the already-started round instead of erroring.

## Disconnect / reconnect state machine

- Waiting room: seat reserved 10 minutes (DB-backed), no removal timer.
- Active round: 60s reconnection window (`ACTIVE_GAME_RECONNECT_MS`), with the
  final displayed second included. The player keeps the same seat and cards.
  Turn order never skips that player. The server may play or pass for the
  missing player when the normal turn timer expires. After the return window,
  the player is removed and their cards are redistributed clockwise when at
  least 3 players remain. If a confirmed departure leaves 2 or fewer players,
  the match ends and every remaining player returns to the menu with "All
  other players have left".
- Results screen (`gameFinished`): treated like the waiting room — 10-minute
  window, no redistribution, cumulative score kept. `roundResult` is persisted
  in room state so reconnecting restores the results screen.
- Rooms are persisted to SQLite on every state change and on shutdown;
  `ensureRoomExists` restores a room from the DB on demand and starts a fresh
  turn timer if a round is active. Socket.io: 120s ping timeout, 30s interval.
- Each browser tab keeps its active room in `sessionStorage`. Saved recovery
  records are kept per room in `localStorage`, so one tab cannot replace or
  clear another tab's room. Returning tabs check the server state. An ended
  room returns to the menu without requiring an explicit Leave action.

## Security / infra notes

- Rate limits are per hashed client IP. Behind the reverse proxy the first
  `x-forwarded-for` entry is used only when the direct peer is
  loopback/private (`getClientAddress`).
- Room codes: 6 chars, ambiguous characters excluded, `crypto.randomInt`,
  checked against both memory and the DB so restarts cannot reissue an active
  code.
- Reconnection requires a random per-seat session token. Room codes and display
  names alone cannot claim a connected or reserved seat.
- Helmet CSP (no inline scripts/styles on served pages), CORS allowlist +
  private-LAN origins, HTTPS redirect in production, `/health` (public,
  minimal) and `/health/admin` (requires `x-admin-key`).

## Commands

```bash
# Server (serves client/dist at /badam7/)
cd server && node index.js            # or: npm run dev (nodemon)
cd server && npm test                 # node --test: unit + socket e2e

# Client
cd client && npm run dev              # Vite dev server
cd client && npm test                 # focused client behavior tests
cd client && npm run build            # tsc + vite build → dist/
cd client && npm run test:e2e         # Playwright UI e2e (builds + runs server on :3101)
cd client && npm run test:family      # headed 6-player smoke game (server must be running)
node client/scripts/join-bots.mjs CODE  # attach 5 headless bots to a room
node client/scripts/render-sound-previews.mjs  # audition the table sounds
```

`NODE_ENV=test` also enables the `/__test__/rooms/:code/*` layout-injection
endpoints used by the Playwright suite.

## TODO / deferred (security)

- Restrictive file permissions for `server/badam-satti.db`.
- Socket event rate limiting is coarse (40 actions/10s per socket); consider
  per-event budgets.
- Secure log rotation; dependency scanning; `.env`-based secret management.
- CSP fine-tuning, request size limits beyond 16kb JSON, brute-force
  protection, automated cert renewal.
