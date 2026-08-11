// Game Types
export interface Card {
  suit: 'hearts' | 'diamonds' | 'clubs' | 'spades';
  rank: number; // 1-13
}

export interface Player {
  name: string;
  connected: boolean;
  cardCount: number;
  dealtCardCount: number;
  isCurrentPlayer: boolean;
  isDealer: boolean;
  totalScore?: number;
  indicator?: 'none' | 'warning' | 'critical';
}

export interface PlayHistoryEntry {
  id: string;
  type: 'play' | 'pass';
  playerName: string;
  card?: Card;
  automatic?: boolean;
}

export interface GameBoard {
  hearts: { up: number[]; down: number[] };
  diamonds: { up: number[]; down: number[] };
  clubs: { up: number[]; down: number[] };
  spades: { up: number[]; down: number[] };
}

export interface DealSummary {
  dealerName: string;
  heartsSevenPlayerName: string;
  extraCardPlayerNames: string[];
  cardsPerPlayer: number;
}

export interface GameState {
  roomCode: string;
  players: Player[];
  board: GameBoard;
  currentPlayerIndex: number;
  currentPlayerName: string;
  dealerName: string;
  dealStartPlayerName: string;
  heartsSevenPlayerName: string;
  round: number;
  maxRounds: number;
  started: boolean;
  roundsPlayed: number;
  gameFinished: boolean;
  gameStartMessage?: string;
  playHistory: PlayHistoryEntry[];
  nextPlayerName?: string;
  turnDurationSeconds?: number;
  turnStartedAt?: number;
  roundResult?: Winner | null;
  dealSummary?: DealSummary | null;
}

export interface Winner {
  type: string;
  winner: string;
  message?: string;
  finalScores?: Array<{
    name: string;
    score: number;
    isWinner: boolean;
    remainingCards?: Card[];
  }>;
}

export interface GameSummary {
  winner: string;
  loser: string;
  totals: Array<{
    name: string;
    totalScore: number;
  }>;
}

export type ComfortSize = 'standard' | 'large' | 'extra-large' | 'maximum';

// UI States
export type Screen = 
  | 'login' 
  | 'menu' 
  | 'waiting' 
  | 'game' 
  | 'game-over' 
  | 'round-start'
  | 'loading' 
  | 'summary';

// Socket Events
export interface SocketEvents {
  // Client to Server
  create_room: (username: string) => void;
  join_room: (data: { roomCode: string; username: string }) => void;
  reconnect_to_room: (data: { roomCode: string; username: string; sessionToken: string }) => void;
  start_game: () => void;
  play_card: (card: Card) => void;
  pass_turn: () => void;
  continue_round: () => void;
  exit_game: () => void;
  leave_room: () => void;
  get_state: () => void;
  set_turn_duration: (seconds: number) => void;

  // Server to Client
  connect: () => void;
  disconnect: () => void;
  connect_error: (error: any) => void;
  room_created: (data: { roomCode: string; sessionToken: string; gameState: GameState }) => void;
  room_joined: (data: { roomCode: string; sessionToken: string; gameState: GameState }) => void;
  room_reconnected: (data: { roomCode: string; sessionToken: string; gameState: GameState; myCards: Card[]; validMoves: Card[]; canPass: boolean }) => void;
  player_joined: (data: { playerName: string; gameState: GameState }) => void;
  player_disconnected: (data: { playerName: string; gameState: GameState }) => void;
  player_temporarily_disconnected: (data: { playerName: string; gameState: GameState; message?: string }) => void;
  player_reconnected: (data: { playerName: string; gameState: GameState }) => void;
  game_started: (data: { gameState: GameState }) => void;
  your_cards: (data: { cards: Card[]; validMoves: Card[]; canPass: boolean }) => void;
  card_played: (data: { playerName: string; card: Card; gameState: GameState; automatic?: boolean }) => void;
  turn_passed: (data: { playerName: string; gameState: GameState; automatic?: boolean }) => void;
  turn_duration_changed: (data: { turnDurationSeconds: number; gameState: GameState }) => void;
  game_over: (winner: Winner) => void;
  game_abandoned: (data: { message: string; recoveryFailure?: boolean }) => void;
  cards_redistributed: (data: { message: string }) => void;
  not_enough_players: (data: { message: string; gameState: GameState }) => void;
  round_continued: (data: { gameState: GameState }) => void;
  game_totals: (summary: GameSummary) => void;
  left_room: () => void;
  game_state: (data: GameState & { gameState?: GameState; myCards?: Card[]; validMoves?: Card[]; canPass?: boolean }) => void;
  error: (message: string | { code?: string; message?: string }) => void;
}

// App State
export interface AppState {
  currentScreen: Screen;
  username: string;
  currentRoom: string;
  sessionToken: string;
  gameState: GameState | null;
  myCards: Card[];
  validMoves: Card[];
  canPass: boolean;
  isMyTurn: boolean;
  error: string | null;
  notification: string | null;
  loading: string | null;
  winner: Winner | null;
  summary: GameSummary | null;
  gameEndedByDepartures: boolean;
}
