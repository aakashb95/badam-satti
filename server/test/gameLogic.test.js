const assert = require('node:assert/strict');
const test = require('node:test');
const { GameRoom } = require('../gameLogic');

function makeRoom(playerCount = 4) {
  const room = new GameRoom('TEST01');
  for (let index = 0; index < playerCount; index += 1) {
    room.addPlayer(`p${index}`, `Player ${index}`);
  }
  return room;
}

test('starts with 7 of hearts on the board and advances to the next player', () => {
  const room = makeRoom(4);
  assert.equal(room.startGame(), true);

  assert.deepEqual(room.board.hearts.up, [7]);
  assert.deepEqual(room.board.hearts.down, []);
  assert.equal(room.players.some((player) => player.cards.some((card) => card.suit === 'hearts' && card.rank === 7)), false);
  assert.notEqual(room.currentPlayerIndex, room.heartsSevenPlayerIndex);
  assert.equal(room.players.reduce((total, player) => total + player.cards.length, 0), 51);
});

test('deals clockwise from the player after the dealer', () => {
  const room = makeRoom(4);
  room.dealerIndex = 1;
  room.deck = room.createDeck();
  room.dealCards();

  assert.deepEqual(room.players[2].cards[0], { suit: 'hearts', rank: 1 });
  assert.deepEqual(room.players[3].cards[0], { suit: 'hearts', rank: 2 });
  assert.deepEqual(room.players[0].cards[0], { suit: 'hearts', rank: 3 });
  assert.deepEqual(room.players[1].cards[0], { suit: 'hearts', rank: 4 });
});

test('rotates dealer to the highest round scorer', () => {
  const room = makeRoom(3);
  room.players[0].cards = [];
  room.players[1].cards = [{ suit: 'spades', rank: 13 }];
  room.players[2].cards = [{ suit: 'clubs', rank: 4 }];

  room.finishGame();

  assert.equal(room.gameFinished, true);
  assert.equal(room.dealerIndex, 1);
  assert.equal(room.players[1].totalScore, 13);
  assert.equal(room.players[2].totalScore, 4);
});

test('does not continue past maxRounds', () => {
  const room = makeRoom(4);
  room.started = true;
  room.round = room.maxRounds;
  room.gameFinished = true;

  assert.equal(room.hasMoreRounds(), false);
  assert.equal(room.continueRound(), false);
  assert.equal(room.round, room.maxRounds);
});

test('removes and redistributes a player without losing cards', () => {
  const room = makeRoom(3);
  room.players[0].cards = [{ suit: 'hearts', rank: 1 }, { suit: 'spades', rank: 13 }];
  room.players[1].cards = [{ suit: 'diamonds', rank: 7 }];
  room.players[2].cards = [{ suit: 'clubs', rank: 8 }];

  room.removePlayer('p0', true);

  assert.equal(room.players.length, 2);
  assert.equal(room.players.reduce((total, player) => total + player.cards.length, 0), 4);
  assert.deepEqual(room.players.map((player) => player.cards.length), [2, 2]);
});

test('keeps the same current player when someone before them leaves', () => {
  const room = makeRoom(4);
  room.currentPlayerIndex = 2;

  room.removePlayer('p0');

  assert.equal(room.players[room.currentPlayerIndex].id, 'p2');
});
