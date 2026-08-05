const assert = require('node:assert/strict');
const test = require('node:test');
const {
  activeReconnectCutoffMs,
  hasActiveReconnectExpired,
} = require('../connectionPolicy');

test('the final second of a 60-second reconnect window remains available', () => {
  const returnWindowMs = 60_000;

  assert.equal(hasActiveReconnectExpired(59_000, returnWindowMs), false);
  assert.equal(hasActiveReconnectExpired(60_000, returnWindowMs), false);
  assert.equal(hasActiveReconnectExpired(61_000, returnWindowMs), true);
  assert.equal(activeReconnectCutoffMs(returnWindowMs), 61_000);
});
