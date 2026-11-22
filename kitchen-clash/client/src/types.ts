export interface Card { id: number; items: number[] }

export type Phase = 'lobby' | 'countdown' | 'playing' | 'finished';

export interface PlayerState {
  name: string;
  cardsLeft: number;
  connected: boolean;
  left: boolean;
  rank: number | null;
  isYou: boolean;
  isHost: boolean;
  reconnectMs: number | null;
  wins: number;
  misses: number;
  averageSpotMs: number | null;
}

export interface GameState {
  roomCode: string;
  phase: Phase;
  roundId: number;
  countdownMs: number | null;
  roundEndsInMs: number | null;
  refreshedRoundId: number | null;
  minPlayers: number;
  maxPlayers: number;
  isHost: boolean;
  hostName: string | null;
  canStart: boolean;
  centre: Card | null;
  lastWin: { name: string; itemId: number; roundId: number; reactionMs: number } | null;
  you: { name: string; cardsLeft: number; topCard: Card | null; rank: number | null; lockoutMs: number } | null;
  players: PlayerState[];
}

export type ClaimResult =
  | { result: 'accepted'; settleMs?: number }
  | { result: 'wrong' | 'locked'; lockoutMs: number }
  | { result: 'stale' | 'pending' | 'not_playing' };
