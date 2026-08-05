import type { AppState, Card, GameState } from './types';

export function endAbandonedGame(previous: AppState, message: string): AppState;
export function restoreReconnectedGame(
  previous: AppState,
  roomCode: string,
  playerState: GameState & {
    myCards?: Card[];
    validMoves?: Card[];
    canPass?: boolean;
  }
): AppState;
