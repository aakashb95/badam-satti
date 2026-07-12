export type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades';
export type ComfortSize = 'standard' | 'large' | 'extra-large' | 'maximum';
export interface Card { suit: Suit; rank: number }
export type PileId = 'north' | 'east' | 'south' | 'west' | 'northWest' | 'northEast' | 'southEast' | 'southWest';
export interface PlayCardAction { type: 'play_card'; card: Card; targetPileId: PileId }
export interface MovePileAction { type: 'move_pile'; sourcePileId: PileId; targetPileId: PileId }
export type SuggestedAction = PlayCardAction | MovePileAction;
export interface PlayerState { name: string; connected: boolean; cardCount: number; isDealer: boolean }
export interface GameState {
  roomCode: string;
  started: boolean;
  finished: boolean;
  winnerName: string | null;
  dealerName: string | null;
  starterName: string | null;
  currentPlayerName: string | null;
  isMyTurn: boolean;
  turnNumber: number;
  actionDeadline: number | null;
  stockCount: number;
  piles: Record<PileId, Card[]>;
  players: PlayerState[];
  myHand: Card[];
  handActions: PlayCardAction[];
  pileActions: MovePileAction[];
  suggestedActions: SuggestedAction[];
  lastAction: Record<string, unknown> | null;
}
