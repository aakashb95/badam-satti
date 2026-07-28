# Badam Satti (Badam 7) — Project Guide

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
`reconnect_to_room({roomCode, username})`, `start_game` (host only, ≥3
connected players), `set_turn_duration(seconds)` (host only, before start),
`play_card(card)`, `pass_turn`, `continue_round`, `exit_game` (host only),
`leave_room(ack?)`, `get_state`.

Server → client: `room_created`, `room_joined`, `room_reconnected`,
`player_joined`, `player_reconnected`, `player_disconnected`,
`player_temporarily_disconnected`, `game_started`, `your_cards({cards,
validMoves})`, `card_played({playerName, card, gameState, automatic?})`,
`turn_passed({playerName, gameState, automatic?})`,
`turn_duration_changed({turnDurationSeconds, gameState})`, `game_over(winner)`,
`round_continued({gameState})`, `cards_redistributed({message})`,
`game_totals`, `left_room`, `game_state`, and `error` (string or
`{code, message}`; codes include `ROOM_NOT_FOUND`, `USERNAME_TAKEN`,
`GAME_ALREADY_STARTED`, `HOST_ONLY`, `NOT_ENOUGH_CONNECTED_PLAYERS`,
`PLAYERS_RECONNECTING`, `RECONNECT_UNAVAILABLE`).

A duplicate `continue_round` (two players tapping "Next round") resyncs the
late caller into the already-started round instead of erroring.

## Disconnect / reconnect state machine

- Waiting room: seat reserved 10 minutes (DB-backed), no removal timer.
- Active round: 60s reconnection window (`ACTIVE_GAME_RECONNECT_MS`), then the
  player is removed and their cards are redistributed starting from the seat
  after theirs, clockwise. A transport drop does not skip the current turn or
  reset its deadline. The server auto-plays when that deadline expires.
- Results screen (`gameFinished`): treated like the waiting room — 10-minute
  window, no redistribution, cumulative score kept.
- Rooms are persisted to SQLite on every state change and on shutdown;
  `ensureRoomExists` restores a room from the DB on demand and starts a fresh
  turn timer if a round is active. Socket.io: 120s ping timeout, 30s interval.

## Security / infra notes

- Rate limits are per hashed client IP. Behind the reverse proxy the first
  `x-forwarded-for` entry is used only when the direct peer is
  loopback/private (`getClientAddress`).
- Room codes: 6 chars, ambiguous characters excluded, `crypto.randomInt`,
  checked against both memory and the DB so restarts cannot reissue an active
  code.
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
cd client && npm run build            # tsc + vite build → dist/
cd client && npm run test:e2e         # Playwright UI e2e (builds + runs server on :3101)
cd client && npm run test:family      # headed 6-player smoke game (server must be running)
node client/scripts/join-bots.mjs CODE  # attach 5 headless bots to a room
```

`NODE_ENV=test` also enables the `/__test__/rooms/:code/*` layout-injection
endpoints used by the Playwright suite.

## TODO / deferred (security)

- Restrictive file permissions for `server/badam-satti.db`.
- Socket event rate limiting is coarse (40 actions/10s per socket); consider
  per-event budgets.
- Session tokens instead of socket IDs; secure log rotation; dependency
  scanning; `.env`-based secret management.
- CSP fine-tuning, request size limits beyond 16kb JSON, brute-force
  protection, automated cert renewal.
