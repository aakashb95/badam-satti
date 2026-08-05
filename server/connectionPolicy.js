const ACTIVE_RECONNECT_FINAL_SECOND_MS = 1000;

function activeReconnectCutoffMs(returnWindowMs) {
  return returnWindowMs + ACTIVE_RECONNECT_FINAL_SECOND_MS;
}

function hasActiveReconnectExpired(elapsedMs, returnWindowMs) {
  return elapsedMs >= activeReconnectCutoffMs(returnWindowMs);
}

module.exports = {
  ACTIVE_RECONNECT_FINAL_SECOND_MS,
  activeReconnectCutoffMs,
  hasActiveReconnectExpired,
};
