# Kitchen Clash

A real-time matching game for 2–6 players, like Spot It / Dobble, with food
and kitchen items. It is a separate game next to Badam Satti and King's
Corner, with its own server, client, Socket.io path (`/kitchen-clash/socket.io`)
and tests.

## Rules

- The deck is the order-7 projective plane: 57 cards of 8 items, and every
  pair of cards shares exactly one item (`server/deck.js`). One card starts in
  the middle and the other 56 are dealt evenly (2 players get 28 each, 6 get 9).
- There are no turns. Everyone races to tap the one item their top card shares
  with the middle card. The fastest correct tap puts that card in the middle.
- A wrong tap locks that player out for 1.5 s. A tap on a middle card that was
  already taken is not penalised.
- Players are ranked as they run out of cards; the game ends when one racer
  is left.
- If nobody finds the match for 60 s (the last 15 s are counted down on
  screen), the middle card is replaced by an undealt spare or an earlier
  middle card. On the very first card, when neither exists, everyone's top
  card goes to the bottom of their pile instead.

## Game modes

The host picks the game in the lobby (`set_mode`). How to play each one is in
`client/src/howto.tsx` and is shown in the lobby, on each solo game's start
screen and in the menu.

- **Race** (default): the rules above.
- **Tower** (2–6 players): everyone starts with one card and the rest of the
  deck feeds the middle. The fastest correct tap wins the middle card, which
  goes on that player's tower and becomes their card to play. When the deck
  runs out the tallest tower wins; equal towers share a place. A stuck middle
  card goes under the deck.
- **Hot Potato** (2–4 players): no middle card. Each deal, everyone holds one
  card and sees everyone's card. Tap the picture your card shares with another
  player's card: your whole stack goes on top of theirs and you are safe for
  that deal. If the picture is on several cards it goes to the next player
  round the table. A player who is away cannot be passed to. The one left
  holding every card loses the deal; after 5 deals (4 s apart) the fewest
  losses wins. A departure that ends a deal ends it with no loser.

Claims, the fair-timing checks and the 1.5 s lockout are the same in every
mode.

## Solo

One player, on the phone only, with no server round trips (`client/src/solo.ts`).
Three games, each with its own start screen and its own best on the phone:

- **Time Attack**: one 60-second clock; match as many as you can. A wrong tap
  takes 3 seconds off the clock (with a 0.5 s pause to show the ✕).
- **Daily Kitchen**: the same 20 cards for everyone on the same date (the
  deck is shuffled with the date as the seed), against a stopwatch. One try a
  day on that phone, then a Share button copies the time.
- **Solo · 30 cards**: a run is 30 cards and each card has its own 30-second clock, shown as a bar
that empties. A match brings the next card. A card whose clock runs out counts
as missed and is shown as missed for a moment without revealing its match. A
wrong tap locks the card for 1.5 s while its clock keeps running. The end
screen shows matched out of 30, missed, total time and average time per match;
the best run (most matched, then fastest) is kept on the phone.

## Screens

- The game table never scrolls. There are no labels on the cards. The middle
  card lies flat on the table in a thin wooden rim; your card is larger,
  red-rimmed and lifted, with the rest of your pile stacked under it and the
  number of cards left beside it. A tap on the middle card makes your card
  jump. Neither card is tilted, so pictures keep their full size.
- Nothing marks the matching picture before the server's verdict. After a
  wrong tap that picture gets a ✕ and the card's rim counts down the 1.5 s;
  after a win the message shows the picture the round was won with.
- The cards stay hidden behind the 3-2-1 countdown.
- Menu (☰): size A / A+ / A++, sounds, music, how to play, leave. Larger sizes
  grow the pictures on the cards as well as the text, and text grows with the
  screen width, so A++ still fits a 320 px phone.

## Fair timing under lag

The phone measures the reaction time from when the current round was painted
to the tap, so network lag in both directions is left out. The server checks
that number against its own clock: it may not be faster than the time since
the server sent the round, minus the slowest recent round trip it measured to
that phone (an app-level ping every 2 s), minus 50 ms. After the first correct
claim the server waits up to 300 ms (the slowest racer's round trip) for other
claims, then awards the lowest reaction time; within 20 ms the earlier arrival
wins. See `checkedReaction` and `settle` in `server/game.js`.

## Connection loss

A dropped player does not pause anyone. Their seat and pile wait 60 s during a
game (10 minutes in the lobby or results), and they rejoin with their
per-seat session token. After that, or after an explicit Leave, their cards
leave the game. Taps are never queued while offline.

## Development

```bash
npm install
npm --prefix server install
npm --prefix client install
npm run dev        # server on :5200, Vite on :5201
npm test           # server (node --test) and client (vitest)
npm run build      # client/dist, served by the server at /kitchen-clash/
```

`ROUND_IDLE_MS` and `ACTIVE_GAME_RECONNECT_MS` override the 60 s timers.
The items are emoji placeholders in `client/src/items.ts` until the final
artwork arrives.
