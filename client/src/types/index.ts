// Game Types
export interface Card {
  suit: 'hearts' | 'diamonds' | 'clubs' | 'spades';
  rank: number; // 1-13
}

export interface Player {
  name: string;
  connected: boolean;
  cardCount: number;
  isCurrentPlayer: boolean;
  totalScore?: number;
}

export interface GameBoard {
  hearts: { up: number[]; down: number[] };
  diamonds: { up: number[]; down: number[] };
  clubs: { up: number[]; down: number[] };
  spades: { up: number[]; down: number[] };
}

export interface GameState {
  roomCode: string;
  players: Player[];
  board: GameBoard;
  currentPlayerIndex: number;
  currentPlayerName: string;
  round: number;
  maxRounds: number;
  started: boolean;
  roundsPlayed: number;
}

export interface Winner {
  type: string;
  winner: string;
  message?: string;
  finalScores?: Array<{
    name: string;
    score: number;
    isWinner: boolean;
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

// UI States
export type Screen = 
  | 'login' 
  | 'menu' 
  | 'waiting' 
  | 'game' 
  | 'game-over' 
  | 'loading' 
  | 'summary';

// Socket Events
export interface SocketEvents {
  // Client to Server
  create_room: (username: string) => void;
  join_room: (data: { roomCode: string; username: string }) => void;
  start_game: () => void;
  play_card: (card: Card) => void;
  pass_turn: () => void;
  continue_round: () => void;
  exit_game: () => void;
  get_state: () => void;

  // Server to Client
  connect: () => void;
  disconnect: () => void;
  connect_error: (error: any) => void;
  room_created: (data: { roomCode: string; gameState: GameState }) => void;
  room_joined: (data: { roomCode: string; gameState: GameState }) => void;
  player_joined: (data: { playerName: string; gameState: GameState }) => void;
  player_disconnected: (data: { playerName: string; gameState: GameState }) => void;
  game_started: (data: { gameState: GameState }) => void;
  your_cards: (data: { cards: Card[]; validMoves: Card[] }) => void;
  card_played: (data: { playerName: string; card: Card; gameState: GameState }) => void;
  turn_passed: (data: { playerName: string; gameState: GameState }) => void;
  game_over: (winner: Winner) => void;
  cards_redistributed: (data: { message: string }) => void;
  round_continued: (data: { gameState: GameState }) => void;
  game_totals: (summary: GameSummary) => void;
  error: (message: string) => void;
}

// App State
export interface AppState {
  currentScreen: Screen;
  username: string;
  currentRoom: string;
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
}