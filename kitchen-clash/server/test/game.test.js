const test = require('node:test');
const assert = require('node:assert/strict');
const { createDeck, sharedItem } = require('../deck');
const { KitchenClashGame, LOCKOUT_MS } = require('../game');

// Starts a game with an unshuffled deck. Every player is shown round 1 at
// t = 1000 ms and has the given round-trip samples.
function playingGame(names, rtts = {}) {
  const game = new KitchenClashGame('TEST01', { makeDeck: () => createDeck() });
  names.forEach((name) => game.addPlayer(name, name, name));
  assert.deepEqual(game.start(names[0], 0), { countdownMs: 3000 });
  game.beginPlay(1000);
  names.forEach((name) => {
    (rtts[name] || []).forEach((rtt) => game.recordRtt(name, rtt));
    game.stateFor(name, 1000);
  });
  return game;
}

const matchFor = (game, id) => sharedItem(game.player(id).pile[0], game.centre);
const wrongItemFor = (game, id) => game.player(id).pile[0].items.find((item) => item !== matchFor(game, id));

test('the deck has 57 cards of 8 items, and every pair of cards shares exactly one item', () => {
  const deck = createDeck();
  assert.equal(deck.length, 57);
  assert.equal(new Set(deck.flatMap((card) => card.items)).size, 57);
  deck.forEach((card) => assert.equal(new Set(card.items).size, 8));
  for (let i = 0; i < deck.length; i += 1) {
    for (let j = i + 1; j < deck.length; j += 1) {
      assert.equal(deck[i].items.filter((item) => deck[j].items.includes(item)).length, 1, `cards ${i} and ${j}`);
    }
  }
});

test('cards are dealt evenly from 56 for every supported table size', () => {
  for (const [count, each] of [[2, 28], [3, 18], [4, 14], [5, 11], [6, 9]]) {
    const names = Array.from({ length: count }, (_, index) => `P${index}`);
    const game = playingGame(names);
    names.forEach((name) => assert.equal(game.player(name).pile.length, each));
  }
  const game = new KitchenClashGame('FULL01');
  for (let index = 0; index < 6; index += 1) game.addPlayer(`p${index}`, `P${index}`);
  assert.match(game.addPlayer('p6', 'P6').error, /full/);
});

test('a two-player game can start, and only the host may start it', () => {
  const game = new KitchenClashGame('TEST02');
  game.addPlayer('a', 'Asha');
  assert.match(game.start('a', 0).error, /2 to 6/);
  game.addPlayer('b', 'Bilal');
  assert.match(game.start('b', 0).error, /host/);
  assert.equal(game.start('a', 0).countdownMs, 3000);
});

test('the faster reaction wins even when it reaches the server later over a slow link', () => {
  const game = playingGame(['Wifi', 'Mobile'], { Wifi: [40], Mobile: [300] });
  const mobileCard = game.player('Mobile').pile[0];
  // Wifi reacts in 1200 ms and arrives at 1000 + 20 + 1200 + 20.
  const first = game.claim('Wifi', { roundId: 1, itemId: matchFor(game, 'Wifi'), reactionMs: 1200 }, 2240);
  assert.deepEqual(first, { result: 'accepted', settleMs: 300 });
  // Mobile reacts in 1000 ms and arrives at 1000 + 150 + 1000 + 150.
  assert.deepEqual(game.claim('Mobile', { roundId: 1, itemId: matchFor(game, 'Mobile'), reactionMs: 1000 }, 2300), { result: 'accepted' });
  game.settle(2540);
  assert.equal(game.lastWin.name, 'Mobile');
  assert.equal(game.centre, mobileCard);
  assert.equal(game.player('Mobile').pile.length, 27);
  assert.equal(game.player('Wifi').pile.length, 28);
  assert.equal(game.roundId, 2);
});

test('a phone that reports an impossibly fast reaction is judged on the server clock', () => {
  const game = playingGame(['Honest', 'Cheater'], { Honest: [400], Cheater: [300] });
  // Cheater arrives first, 1290 ms after the round was sent, but reports
  // 100 ms. The server's floor for it is 1290 - 300 - 50 = 940 ms.
  game.claim('Cheater', { roundId: 1, itemId: matchFor(game, 'Cheater'), reactionMs: 100 }, 2290);
  // Honest really took 900 ms and arrives at 1000 + 200 + 900 + 200.
  game.claim('Honest', { roundId: 1, itemId: matchFor(game, 'Honest'), reactionMs: 900 }, 2300);
  game.settle(2600);
  assert.equal(game.lastWin.name, 'Honest');
  assert.equal(game.lastWin.reactionMs, 900);
});

test('without round-trip samples, the earlier arrival wins', () => {
  const game = playingGame(['First', 'Second']);
  game.claim('Second', { roundId: 1, itemId: matchFor(game, 'Second'), reactionMs: 300 }, 1900);
  game.claim('First', { roundId: 1, itemId: matchFor(game, 'First'), reactionMs: 300 }, 1950);
  game.settle(2100);
  assert.equal(game.lastWin.name, 'Second');
});

test('a wrong tap locks that player out for 1.5 s, and taps during the lockout are refused', () => {
  const game = playingGame(['Asha', 'Bilal']);
  assert.deepEqual(game.claim('Asha', { roundId: 1, itemId: wrongItemFor(game, 'Asha'), reactionMs: 500 }, 1500), { result: 'wrong', lockoutMs: LOCKOUT_MS });
  assert.equal(game.player('Asha').misses, 1);
  assert.deepEqual(game.claim('Asha', { roundId: 1, itemId: matchFor(game, 'Asha'), reactionMs: 600 }, 2999), { result: 'locked', lockoutMs: 1 });
  assert.equal(game.claim('Asha', { roundId: 1, itemId: matchFor(game, 'Asha'), reactionMs: 1900 }, 3000).result, 'accepted');
  assert.equal(game.player('Asha').misses, 1);
});

test('a tap on the old centre after someone else won is not a miss', () => {
  const game = playingGame(['Asha', 'Bilal']);
  const bilalMatch = matchFor(game, 'Bilal');
  game.claim('Asha', { roundId: 1, itemId: matchFor(game, 'Asha'), reactionMs: 700 }, 1800);
  game.settle(2000);
  assert.deepEqual(game.claim('Bilal', { roundId: 1, itemId: bilalMatch, reactionMs: 1100 }, 2100), { result: 'stale' });
  assert.equal(game.player('Bilal').misses, 0);
  assert.equal(game.player('Bilal').lockedUntil, 0);
  // Bilal's same card still has exactly one match on the new centre.
  assert.equal(game.claim('Bilal', { roundId: 2, itemId: matchFor(game, 'Bilal'), reactionMs: 900 }, 3000).result, 'accepted');
});

test('players are ranked as they empty their piles and the last racer takes the last place', () => {
  const game = playingGame(['Asha', 'Bilal', 'Chitra']);
  game.player('Asha').pile.splice(1);
  game.player('Bilal').pile.splice(1);
  let time = 2000;
  const winRound = (id) => {
    game.claim(id, { roundId: game.roundId, itemId: matchFor(game, id), reactionMs: 500 }, time);
    game.settle(time + 100);
    time += 1000;
  };
  winRound('Bilal');
  assert.equal(game.player('Bilal').rank, 1);
  assert.equal(game.phase, 'playing');
  assert.equal(game.claim('Bilal', { roundId: game.roundId, itemId: 0, reactionMs: 500 }, time).result, 'not_playing');
  winRound('Asha');
  assert.equal(game.phase, 'finished');
  assert.deepEqual(['Asha', 'Bilal', 'Chitra'].map((id) => game.player(id).rank), [2, 1, 3]);
});

test('a dropped player does not pause the race and keeps their pile until removed', () => {
  const game = playingGame(['Asha', 'Bilal', 'Chitra']);
  game.disconnectPlayer('Chitra', 1200, 60_000);
  const chitraPile = [...game.player('Chitra').pile];
  game.claim('Asha', { roundId: 1, itemId: matchFor(game, 'Asha'), reactionMs: 500 }, 1600);
  game.settle(1800);
  assert.equal(game.lastWin.name, 'Asha');
  assert.equal(game.stateFor('Asha', 2000).players.find((item) => item.name === 'Chitra').reconnectMs, 59_200);

  game.reconnectPlayer('Chitra', 'chitra-new-socket');
  assert.deepEqual(game.player('chitra-new-socket').pile, chitraPile);
  const state = game.stateFor('chitra-new-socket', 5000);
  assert.equal(state.roundId, 2);
  assert.equal(state.you.topCard, chitraPile[0]);
  assert.equal(game.claim('chitra-new-socket', { roundId: 2, itemId: matchFor(game, 'chitra-new-socket'), reactionMs: 800 }, 5900).result, 'accepted');
});

test('when departures leave one racer the game ends and ranks them', () => {
  const game = playingGame(['Asha', 'Bilal', 'Chitra']);
  game.removePlayer('Chitra');
  assert.equal(game.phase, 'playing');
  assert.equal(game.player('Chitra').pile.length, 0);
  game.removePlayer('Asha');
  assert.equal(game.phase, 'finished');
  assert.equal(game.player('Bilal').rank, 1);
  assert.equal(game.hostToken, 'Bilal');
});

test('a round with no match gets a new middle card that still matches every player', () => {
  const game = playingGame(['Asha', 'Bilal', 'Chitra']);
  const before = game.centre;
  const piles = ['Asha', 'Bilal', 'Chitra'].map((id) => game.player(id).pile.length);
  assert.equal(game.stateFor('Asha', 50_000).roundEndsInMs, 11_000);
  assert.equal(game.refreshRound(61_000), true);
  assert.notEqual(game.centre, before);
  assert.equal(game.roundId, 2);
  assert.equal(game.stateFor('Asha', 61_000).refreshedRoundId, 1);
  assert.deepEqual(['Asha', 'Bilal', 'Chitra'].map((id) => game.player(id).pile.length), piles);
  ['Asha', 'Bilal', 'Chitra'].forEach((id) => assert.notEqual(matchFor(game, id), undefined));
  assert.equal(game.claim('Asha', { roundId: 1, itemId: 0, reactionMs: 500 }, 61_100).result, 'stale');
});

test('with no spare or earlier middle card, a stuck round turns everyone to their next card', () => {
  const game = playingGame(['Asha', 'Bilal']);
  assert.equal(game.spares.length, 0);
  const tops = ['Asha', 'Bilal'].map((id) => game.player(id).pile[0]);
  const centre = game.centre;
  game.refreshRound(61_000);
  assert.equal(game.centre, centre);
  ['Asha', 'Bilal'].forEach((id, index) => {
    assert.notEqual(game.player(id).pile[0], tops[index]);
    assert.equal(game.player(id).pile.at(-1), tops[index]);
  });
});
