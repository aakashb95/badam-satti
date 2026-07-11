# King's Corner

An independent real-time multiplayer implementation of Bicycle King's Corner for 2–4 players. It intentionally shares only the visual language and card artwork of Badam Satti; its game engine, Socket.io protocol, dependencies, tests, and deployment are isolated under this directory.

## Rules used

- Seven cards per player; player left of the dealer starts.
- Draw one card automatically at the start of each turn.
- Build downward in alternating colours.
- Only Kings can open the four corner piles.
- A complete board pile can move onto another compatible pile.
- A player may perform any number of actions and then finish the turn.
- Every 10 seconds of inactivity, the server performs one suggested action. It prefers a hand play, then an unseen board-pile move. If neither makes progress, it ends the turn.
- The first empty hand wins immediately.

## Development

```bash
npm install
npm --prefix server install
npm --prefix client install
npm run dev
```

Open `http://localhost:5101`. The Vite server proxies Socket.io to port `5100`.

## Verification

```bash
npm test
npm run build
npm run test:e2e
```

For production, build the client and run the server. Express serves `client/dist` on `PORT` (default `5100`).
