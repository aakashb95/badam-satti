import assert from 'node:assert/strict';
import test from 'node:test';
import {
  SCORE_COUNTING_SPLASH_MS,
  NEXT_ROUND_SPLASH_MS,
  NEXT_ROUND_STAGE_DELAYS_MS,
} from './roundTiming.js';

test('score counting stays brief and the next deal builds into a readable stack', () => {
  assert.equal(SCORE_COUNTING_SPLASH_MS, 1200);
  assert.equal(NEXT_ROUND_SPLASH_MS, 5000);
  assert.deepEqual(NEXT_ROUND_STAGE_DELAYS_MS, [250, 1500, 2750]);
});
