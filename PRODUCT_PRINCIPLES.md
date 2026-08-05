# Product principles

## Purpose

Badam Satti must provide an excellent game experience for people playing on different devices and internet connections. Players may be in different cities, may switch apps, may receive calls, and may briefly lose their connection. The game must protect the player experience instead of removing players because connection handling is simpler.

The rules in this document are product requirements. Treat them as acceptance criteria for every gameplay, layout, card, timer, and connection change.

An active game needs at least three players. Do not start a game or continue a new round with fewer than three players.

## Card visibility

Players must be able to read and use their cards without scrolling during normal gameplay on supported phones, tablets, laptops, and desktop screens. The layout must continue to work in portrait and landscape views and when the user changes the text size.

Card layout changes must follow these rules:

- Every card in the player's hand must remain identifiable and reachable.
- A playable card should rise above the other cards so the choice is clear.
- A raised playable card must not hide or block cards in the row or suit below it.
- The highest played card for every suit must remain visible and correct.
- The lower right rank and suit mark must remain visible when cards overlap. The lower right mark exists so players can still identify the card when most of the card is covered.
- The board, player list, turn information, and hand must fit together without hiding essential game information.
- Do not solve a layout problem by cropping card information, making cards unreadably small, or adding gameplay scrolling.

Check card and gameplay changes on a small phone, a current phone, a tablet, and a desktop screen. Check portrait and landscape layouts where the device supports both. Check larger text sizes as well as the default text size.

## Round transitions

After a round ends, show one brief counting-scores state before the round results. Do not make players wait through several result messages before they can read the score table.

After a player selects Next round and the new cards are dealt, show a five-second deal summary before gameplay. Add each fact as a new row below the previous fact. Keep earlier rows visible so the screen builds into one readable summary without flashing. Show the highest scorer who now deals, the player who received 7♥ and starts the round, and the players who received extra cards. When the cards divide evenly, say so instead of showing an empty extra-card list.

## Connection loss and leaving

Connection loss is not the same as leaving the game.

A connection can disappear because the player received a call, switched apps, moved between networks, lost signal, or had a browser problem. The server must keep the player's seat, cards, score, and place in the game for the active game return period. The default return period is 60 seconds. Do not shorten or remove the return period without an explicit product decision.

During the return period:

- Do not redistribute the missing player's cards.
- Never skip a missing player's turn. Each player's cards affect what every other player can play, so the turn order must stay unchanged.
- If the missing player is not the current player, play continues in normal seat order until their turn arrives.
- When the missing player's turn reaches its normal deadline, the server may make a legal play or pass for that seat. This is a turn taken for the missing player, not a skipped turn.
- When the player returns, restore the same cards, score, seat, and game screen.
- Do not let the disconnected client queue a move or timer action for delivery after reconnection.

A temporary connection loss does not reduce the number of remaining players. The player still owns their seat until they leave or their return period expires.

When a departure is confirmed:

- Remove the player from the game.
- If at least three players remain, redistribute the departed player's cards and continue from the correct turn.
- If two or fewer players remain, end the game for every remaining player. Return them to the menu and show "All other players have left".
- Do not leave two players on the gameplay screen after other players have left.

Voluntary leaving has different rules:

- The in-game cross button and any Leave action must send an explicit leave message to the server.
- An explicit leave removes the player immediately and redistributes their cards when the game can continue.
- Do not treat a generic socket disconnect as proof that the player chose to leave.
- A tab or browser close may try to send the explicit leave message. If the server does not receive that message, treat the event as connection loss and preserve the player for the return period.

## Verification

Changes that affect these rules need focused checks. Connection changes must cover temporary loss, pausing on the missing player's exact turn, return with the same cards, expiry, explicit leave, simultaneous disconnects, and ending when confirmed departures leave two or fewer players. Card layout changes must include visual checks at the supported screen and text sizes.
