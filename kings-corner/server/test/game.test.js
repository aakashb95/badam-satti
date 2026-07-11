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
