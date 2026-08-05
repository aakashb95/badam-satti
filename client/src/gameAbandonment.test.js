import assert from 'node:assert/strict';
import test from 'node:test';
import { endAbandonedGame, restoreReconnectedGame } from './gameAbandonment.js';

test('abandoned game leaves gameplay, clears turn data, and explains why it ended', () => {
  const playing = {
    currentScreen: 'game',
    username: 'P2',
    currentRoom: 'ABC123',
    gameState: {
      roomCode: 'ABC123',
      players: [],
      board: {
        hearts: { up: [7], down: [] },
        diamonds: { up: [], down: [] },
        clubs: { up: [], down: [] },
        spades: { up: [], down: [] },
      },
      currentPlayerIndex: 0,
      currentPlayerName: 'P2',
      dealerName: 'P2',
      round: 1,
      maxRounds: 7,
      started: true,
      roundsPlayed: 0,
    },
    myCards: [{ suit: 'hearts', rank: 8 }],
    validMoves: [{ suit: 'hearts', rank: 8 }],
    canPass: false,
    isMyTurn: true,
    error: 'stale error',
    notification: null,
    loading: 'stale loading',
    winner: null,
    summary: null,
  };

  const ended = endAbandonedGame(playing, 'All other players have left');

  assert.equal(ended.currentScreen, 'menu');
  assert.equal(ended.currentRoom, '');
  assert.equal(ended.gameState, null);
  assert.deepEqual(ended.myCards, []);
  assert.deepEqual(ended.validMoves, []);
  assert.equal(ended.isMyTurn, false);
  assert.equal(ended.notification, 'All other players have left');
  assert.equal(ended.error, null);
  assert.equal(ended.loading, null);
});

test('reconnected game restores the same hand and gameplay screen', () => {
  const previous = {
    currentScreen: 'game',
    username: 'P2',
    currentRoom: 'ABC123',
    gameState: null,
    myCards: [],
    validMoves: [],
    canPass: false,
    isMyTurn: false,
    error: null,
    notification: null,
    loading: 'Reconnecting',
    winner: null,
    summary: null,
  };
  const hand = [{ suit: 'hearts', rank: 8 }];
  const playerState = {
    roomCode: 'ABC123',
    players: [],
    board: {
      hearts: { up: [7], down: [] },
      diamonds: { up: [], down: [] },
      clubs: { up: [], down: [] },
      spades: { up: [], down: [] },
    },
    currentPlayerIndex: 0,
    currentPlayerName: 'P2',
    dealerName: 'P2',
    round: 1,
    maxRounds: 7,
    started: true,
    roundsPlayed: 0,
    pausedForReconnection: false,
    myCards: hand,
    validMoves: hand,
    canPass: false,
  };

  const restored = restoreReconnectedGame(previous, 'ABC123', playerState);

  assert.equal(restored.currentScreen, 'game');
  assert.deepEqual(restored.myCards, hand);
  assert.deepEqual(restored.validMoves, hand);
  assert.equal(restored.loading, null);
});
