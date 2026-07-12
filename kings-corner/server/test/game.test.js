const test = require('node:test');
const assert = require('node:assert/strict');
const { KingsCornerGame, canStack, createDeck } = require('../game');

const card = (rank, suit) => ({ rank, suit });

function startedGame() {
  const game = new KingsCornerGame('TEST01');
  game.addPlayer('a', 'Aakash');
  game.addPlayer('b', 'Maya');
  game.started = true;
  game.currentPlayerIndex = 0;
  game.piles.north = [card(8, 'hearts')];
  game.piles.east = [card(11, 'clubs')];
  game.piles.south = [card(4, 'diamonds')];
  game.piles.west = [card(2, 'spades')];
  game.turnBoardSignatures = new Set([game.boardSignature()]);
  return game;
}

test('deck contains 52 unique cards', () => {
  const deck = createDeck();
  assert.equal(deck.length, 52);
  assert.equal(new Set(deck.map((item) => `${item.rank}:${item.suit}`)).size, 52);
});

test('stacking is descending and alternating colour', () => {
  assert.equal(canStack(card(7, 'clubs'), card(8, 'hearts')), true);
  assert.equal(canStack(card(7, 'diamonds'), card(8, 'hearts')), false);
  assert.equal(canStack(card(9, 'clubs'), card(8, 'hearts')), false);
});

test('only a king may start an empty corner', () => {
  const game = startedGame();
  assert.equal(game.canPlayCard(card(13, 'clubs'), 'northWest'), true);
  assert.equal(game.canPlayCard(card(12, 'clubs'), 'northWest'), false);
  assert.equal(game.canPlayCard(card(3, 'clubs'), 'northEast'), false);
  game.piles.north = [];
  assert.equal(game.canPlayCard(card(13, 'clubs'), 'north'), false);
  assert.equal(game.canPlayCard(card(12, 'clubs'), 'north'), true);
});

test('a suggested board pile can be tapped and moved', () => {
  const game = startedGame();
  game.piles.north = [card(8, 'hearts'), card(7, 'clubs')];
  game.piles.east = [card(9, 'clubs')];
  game.turnBoardSignatures = new Set([game.boardSignature()]);
  const suggestion = game.suggestedActions().find((action) => action.type === 'move_pile');
  assert.deepEqual(suggestion, { type: 'move_pile', sourcePileId: 'north', targetPileId: 'east' });
  assert.equal(game.movePile('a', suggestion.sourcePileId, suggestion.targetPileId), true);
  assert.equal(game.piles.north.length, 0);
  assert.deepEqual(game.piles.east, [card(9, 'clubs'), card(8, 'hearts'), card(7, 'clubs')]);
});

test('a complete sequence may fill an empty cardinal position', () => {
  const game = startedGame();
  game.piles.north = [];
  game.piles.east = [card(9, 'clubs'), card(8, 'hearts')];
  assert.equal(game.movePile('a', 'east', 'north'), true);
  assert.deepEqual(game.piles.north, [card(9, 'clubs'), card(8, 'hearts')]);
  assert.equal(game.piles.east.length, 0);
});

test('a king pile on the main board is suggested into an empty corner', () => {
  const game = startedGame();
  game.piles.north = [card(13, 'spades'), card(12, 'hearts')];
  game.piles.northWest = [];
  game.turnBoardSignatures = new Set([game.boardSignature()]);
  assert.deepEqual(game.suggestedActions().find((action) => action.type === 'move_pile'), {
    type: 'move_pile', sourcePileId: 'north', targetPileId: 'northWest',
  });
});

test('only the most helpful legal action is promoted', () => {
  const game = startedGame();
  game.players[0].hand = [card(7, 'clubs'), card(12, 'hearts')];
  game.piles.north = [];
  const suggestions = game.suggestedActions();
  assert.equal(suggestions.length, 1);
  assert.deepEqual(suggestions[0], {
    type: 'play_card', card: card(12, 'hearts'), targetPileId: 'north',
  });
  assert.equal(game.handActions().length > suggestions.length, true);
});

test('a king anchored in a corner can never move back to the main board', () => {
  const game = startedGame();
  game.piles.north = [];
  game.piles.northWest = [card(13, 'spades'), card(12, 'hearts')];
  assert.equal(game.pileActions().some((action) => action.sourcePileId === 'northWest'), false);
  assert.equal(game.movePile('a', 'northWest', 'north'), false);
});

test('auto action plays a hand card before moving a board pile', () => {
  const game = startedGame();
  game.players[0].hand = [card(7, 'clubs'), card(6, 'hearts')];
  const action = game.performAutoAction();
  assert.equal(action.type, 'play_card');
  assert.equal(game.players[0].hand.length, 1);
  assert.deepEqual(game.piles.north.at(-1), card(7, 'clubs'));
});

test('each auto tick performs another action while one exists', () => {
  const game = startedGame();
  game.players[0].hand = [card(7, 'clubs'), card(6, 'hearts')];
  game.performAutoAction();
  game.performAutoAction();
  assert.equal(game.finished, true);
  assert.equal(game.winnerId, 'a');
});

test('auto action ends the turn when no progressive action exists', () => {
  const game = startedGame();
  game.players[0].hand = [card(12, 'hearts')];
  game.stock = [card(5, 'clubs')];
  const action = game.performAutoAction();
  assert.equal(action.type, 'end_turn');
  assert.equal(game.currentPlayer().id, 'b');
  assert.equal(game.players[1].hand.length, 1);
});

test('drawing a king places it in a corner and draws a replacement card', () => {
  const game = startedGame();
  game.players[0].hand = [];
  game.piles.northWest = [];
  game.stock = [card(5, 'clubs'), card(13, 'spades')];
  game.beginTurn();
  assert.deepEqual(game.piles.northWest, [card(13, 'spades')]);
  assert.deepEqual(game.players[0].hand, [card(5, 'clubs')]);
  assert.equal(game.stock.length, 0);
  assert.equal(game.lastAction.drawnKings, 1);
});

test('the host can restart a finished table with a rotated dealer', () => {
  const game = startedGame();
  game.finished = true;
  game.winnerId = 'a';
  game.started = true;
  game.makeDeck = () => createDeck();
  assert.equal(game.restart('a'), true);
  assert.equal(game.finished, false);
  assert.equal(game.started, true);
  assert.equal(game.dealerIndex, 1);
  assert.equal(game.starterName, game.currentPlayer().name);
  assert.equal(game.players.every((player) => player.hand.length >= 7), true);
});

test('malformed card actions are rejected without throwing', () => {
  const game = startedGame();
  game.players[0].hand = [card(7, 'clubs')];
  assert.doesNotThrow(() => game.playCard('a', undefined, 'north'));
  assert.equal(game.playCard('a', undefined, 'north'), false);
  assert.equal(game.playCard('a', { rank: '7', suit: 'clubs' }, 'north'), false);
  assert.deepEqual(game.players[0].hand, [card(7, 'clubs')]);
});

test('leaving the waiting room removes the player and promotes a new host', () => {
  const game = new KingsCornerGame('TEST02');
  game.addPlayer('host', 'Host');
  game.addPlayer('guest', 'Guest');
  game.removePlayer('host');
  assert.deepEqual(game.players.map((player) => player.name), ['Guest']);
  assert.equal(game.players[0].id, 'guest');
});

test('leaving an active two-player game awards the remaining player', () => {
  const game = startedGame();
  game.players[0].hand = [card(7, 'clubs')];
  game.players[1].hand = [card(6, 'hearts')];
  game.stock = [];
  game.removePlayer('a');
  assert.equal(game.finished, true);
  assert.equal(game.winnerId, 'b');
  assert.equal(game.players[0].name, 'Maya');
  assert.equal(game.stock.some((item) => item.rank === 7 && item.suit === 'clubs'), true);
});
