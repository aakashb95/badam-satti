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
  assert.match(room.gameStartMessage, /deals Round 1/);
  assert.match(room.gameStartMessage, /starts with 7♥$/);
  assert.equal(room.playHistory.length, 1);
  assert.deepEqual(room.playHistory[0].card, { suit: 'hearts', rank: 7 });
  assert.equal(room.playHistory[0].automatic, true);
  assert.equal(room.getState().players.reduce((total, player) => total + player.dealtCardCount, 0), 52);
});

test('refuses to start while a disconnected player is still seated', () => {
  const room = makeRoom(3);
  room.setPlayerDisconnected('p1');

  assert.equal(room.startGame(), false);
  assert.equal(room.started, false);
  assert.equal(room.players.reduce((total, player) => total + player.cards.length, 0), 0);
  assert.deepEqual(room.board.hearts.up, []);
});

test('requires at least three players to start', () => {
  const room = makeRoom(2);

  assert.equal(room.startGame(), false);
  assert.equal(room.started, false);
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
  assert.equal(room.getState().dealStartPlayerName, 'Player 2');
});

test('records card plays and passes in order', () => {
  const room = makeRoom(3);
  room.started = true;
  room.currentPlayerIndex = 0;
  room.players[0].cards = [{ suit: 'hearts', rank: 7 }, { suit: 'clubs', rank: 2 }];

  assert.equal(room.playCard('p0', { suit: 'hearts', rank: 7 }), true);
  assert.equal(room.passTurn('p1'), true);

  assert.deepEqual(room.playHistory.map((entry) => entry.type), ['play', 'pass']);
  assert.deepEqual(room.playHistory.map((entry) => entry.playerName), ['Player 0', 'Player 1']);
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

test('refuses to deal the next round while a player is disconnected', () => {
  const room = makeRoom(3);
  room.started = true;
  room.gameFinished = true;
  room.players[0].cards = [{ suit: 'hearts', rank: 1 }];
  room.setPlayerDisconnected('p1');

  assert.equal(room.continueRound(), false);
  assert.equal(room.round, 1);
  assert.equal(room.gameFinished, true);
  assert.deepEqual(room.players[0].cards, [{ suit: 'hearts', rank: 1 }]);
});

test('refuses to deal the next round with fewer than three players', () => {
  const room = makeRoom(2);
  room.started = true;
  room.gameFinished = true;

  assert.equal(room.continueRound(), false);
  assert.equal(room.round, 1);
});

test('continues the active round while a disconnected player still owns a seat', () => {
  const room = makeRoom(3);
  room.started = true;
  room.currentPlayerIndex = 0;
  room.players[0].cards = [
    { suit: 'hearts', rank: 7 },
    { suit: 'clubs', rank: 2 },
  ];
  room.setPlayerDisconnected('p2');

  assert.deepEqual(room.getValidMoves('p0'), [{ suit: 'hearts', rank: 7 }]);
  assert.equal(room.playCard('p0', { suit: 'hearts', rank: 7 }), true);
  assert.equal(room.players[room.currentPlayerIndex].id, 'p1');
});

test('never skips a disconnected player when advancing the turn', () => {
  const room = makeRoom(5);
  room.started = true;
  room.currentPlayerIndex = 0;
  room.setPlayerDisconnected('p1');

  room.nextTurn();

  assert.equal(room.players[room.currentPlayerIndex].id, 'p1');
  assert.equal(room.getNextPlayerName(), 'Player 2');
});

test('stores the finished round result in public state', () => {
  const room = makeRoom(3);
  room.players[0].cards = [];
  room.players[1].cards = [{ suit: 'spades', rank: 13 }];
  room.players[2].cards = [{ suit: 'clubs', rank: 4 }];

  room.finishGame();

  assert.equal(room.getState().roundResult.winner, 'Player 0');
  assert.equal(room.getState().roundResult.finalScores.length, 3);
});

test('abandoning a game returns the room to a clean waiting state', () => {
  const room = makeRoom(3);
  room.startGame();
  room.players[0].totalScore = 12;

  room.abandonGame();

  const state = room.getState();
  assert.equal(state.started, false);
  assert.equal(state.gameFinished, false);
  assert.equal(state.round, 1);
  assert.equal(state.roundResult, null);
  assert.equal(state.players.every((player) => player.cardCount === 0), true);
  assert.equal(state.players.every((player) => player.totalScore === 0), true);
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

test('deals every hand sorted by suit then ascending rank', () => {
  const room = makeRoom(4);
  room.startGame();

  const suitOrder = { hearts: 0, diamonds: 1, clubs: 2, spades: 3 };
  room.players.forEach((player) => {
    for (let index = 1; index < player.cards.length; index += 1) {
      const previous = player.cards[index - 1];
      const current = player.cards[index];
      const inOrder =
        suitOrder[previous.suit] < suitOrder[current.suit] ||
        (previous.suit === current.suit && previous.rank < current.rank);
      assert.ok(inOrder, `${player.name} hand out of order at index ${index}`);
    }
  });
});

test('redistributes a leaver\'s cards starting from the next seat clockwise', () => {
  const room = makeRoom(4);
  room.players[0].cards = [{ suit: 'hearts', rank: 2 }];
  room.players[1].cards = [
    { suit: 'hearts', rank: 3 },
    { suit: 'diamonds', rank: 4 },
    { suit: 'clubs', rank: 5 },
  ];
  room.players[2].cards = [{ suit: 'hearts', rank: 6 }];
  room.players[3].cards = [{ suit: 'hearts', rank: 9 }];

  // p1 leaves: their three cards should go to p2, p3, p0 in that order,
  // not systematically to seat 0.
  room.removePlayer('p1', true);

  const byName = new Map(room.players.map((player) => [player.name, player.cards]));
  assert.equal(byName.get('Player 2').length, 2);
  assert.equal(byName.get('Player 3').length, 2);
  assert.equal(byName.get('Player 0').length, 2);
  assert.ok(byName.get('Player 2').some((card) => card.rank === 3 && card.suit === 'hearts'));
  assert.ok(byName.get('Player 3').some((card) => card.rank === 4 && card.suit === 'diamonds'));
  assert.ok(byName.get('Player 0').some((card) => card.rank === 5 && card.suit === 'clubs'));
});

test('exposes turn timing and the next seated player in state', () => {
  const room = makeRoom(4);
  assert.equal(room.setTurnDuration(40), true);
  assert.equal(room.setTurnDuration(37), false);
  room.startGame();

  const before = room.turnStartedAt;
  const state = room.getState();
  assert.equal(state.turnDurationSeconds, 40);
  assert.equal(state.turnStartedAt, before);

  const expectedNextIndex = (room.currentPlayerIndex + 1) % room.players.length;
  assert.equal(state.nextPlayerName, room.players[expectedNextIndex].name);

  // A temporary disconnect never changes seat order.
  room.players[expectedNextIndex].connected = false;
  assert.equal(room.getState().nextPlayerName, room.players[expectedNextIndex].name);

  // Timer cannot change once the game has started
  assert.equal(room.setTurnDuration(60), false);
});

test('summarizes the dealer, starter, and extra cards in a five-player deal', () => {
  const room = makeRoom(5);
  room.dealerIndex = 0;
  room.deck = room.createDeck();
  room.dealCards();
  room.started = true;
  room.heartsSevenPlayerIndex = room.players.findIndex((player) =>
    player.cards.some((card) => card.suit === 'hearts' && card.rank === 7)
  );

  assert.deepEqual(room.getState().dealSummary, {
    dealerName: 'Player 0',
    heartsSevenPlayerName: 'Player 2',
    extraCardPlayerNames: ['Player 1', 'Player 2'],
    cardsPerPlayer: 10,
  });
});

test('summarizes an even four-player deal without extra-card recipients', () => {
  const room = makeRoom(4);
  room.deck = room.createDeck();
  room.dealCards();
  room.started = true;
  room.heartsSevenPlayerIndex = room.players.findIndex((player) =>
    player.cards.some((card) => card.suit === 'hearts' && card.rank === 7)
  );

  assert.deepEqual(room.getState().dealSummary.extraCardPlayerNames, []);
  assert.equal(room.getState().dealSummary.cardsPerPlayer, 13);
});
