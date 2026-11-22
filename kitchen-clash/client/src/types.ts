export interface Card { id: number; items: number[] }

export type Phase = 'lobby' | 'countdown' | 'playing' | 'finished';
export type GameMode = 'race' | 'tower' | 'hot-potato';

export interface PlayerState {
  name: string;
  cardsLeft: number;
  connected: boolean;
  left: boolean;
  rank: number | null;
  // Joined after the game started; dealt in to the next one.
  waiting: boolean;
  isYou: boolean;
  isHost: boolean;
  reconnectMs: number | null;
  wins: number;
  misses: number;
  averageSpotMs: number | null;
  // Hot Potato: deals lost so far, and this player's top card while playing.
  losses: number;
  topCard: Card | null;
}

// A finished game's standings, kept as the game ended.
export interface ResultPlayer {
  name: string;
  rank: number | null;
  left: boolean;
  wins: number;
  misses: number;
  losses: number;
  averageSpotMs: number | null;
  tower: number;
}

export interface GameState {
  roomCode: string;
  phase: Phase;
  mode: GameMode;
  // Hot Potato: the current deal, how many there are, and how the last one ended.
  deal: number;
  totalDeals: number;
  lastDeal: { deal: number; loser: string | null; cards: number } | null;
  // Tower: cards left to win.
  deckLeft: number | null;
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
  // `to` is who a Hot Potato pass went to.
  lastWin: { name: string; to?: string; itemId: number; roundId: number; reactionMs: number } | null;
  result: { mode: GameMode; players: ResultPlayer[] } | null;
  you: { name: string; cardsLeft: number; topCard: Card | null; rank: number | null; waiting: boolean; lockoutMs: number } | null;
  players: PlayerState[];
}

// What an invite link shows before joining.
export interface RoomSummary { roomCode: string; hostName: string | null; mode: GameMode; phase: Phase; seats: number; maxPlayers: number }

export type ClaimResult =
  | { result: 'accepted'; settleMs?: number }
  | { result: 'wrong' | 'locked'; lockoutMs: number }
  | { result: 'stale' | 'pending' | 'not_playing' };
