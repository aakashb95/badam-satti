export function endAbandonedGame(previous, message) {
  return {
    ...previous,
    currentRoom: '',
    sessionToken: '',
    gameState: null,
    myCards: [],
    validMoves: [],
    canPass: false,
    isMyTurn: false,
    currentScreen: 'menu',
    winner: null,
    summary: null,
    gameEndedByDepartures: false,
    loading: null,
    error: null,
    notification: message,
  };
}

export function restoreReconnectedGame(previous, roomCode, playerState) {
  return {
    ...previous,
    currentRoom: roomCode,
    gameState: playerState,
    myCards: playerState.myCards || [],
    validMoves: playerState.validMoves || [],
    canPass: Boolean(playerState.canPass),
    currentScreen: playerState.started ? 'game' : 'waiting',
    loading: null,
  };
}
