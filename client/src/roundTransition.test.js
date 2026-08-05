import assert from 'node:assert/strict';
import test from 'node:test';
import { createNextRoundStages } from './roundTransition.js';

test('next round summary explains dealer, starter, and extra cards', () => {
  assert.deepEqual(createNextRoundStages({
    dealerName: 'Asha',
    heartsSevenPlayerName: 'Kabir',
    extraCardPlayerNames: ['Meera', 'Zoya'],
    cardsPerPlayer: 10,
  }), [
    { label: 'Highest score', value: 'Asha deals' },
    { label: '7♥', value: 'Kabir starts' },
    { label: 'Extra cards', value: 'Meera and Zoya' },
  ]);
});

test('next round summary explains an even deal', () => {
  assert.deepEqual(createNextRoundStages({
    dealerName: 'Asha',
    heartsSevenPlayerName: 'Kabir',
    extraCardPlayerNames: [],
    cardsPerPlayer: 13,
  })[2], { label: 'Even deal', value: '13 cards each' });
});
