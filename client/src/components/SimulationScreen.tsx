import React, { useEffect, useMemo, useState } from 'react';
import GameDeskLink from './GameDeskLink';
import { Card, GameBoard } from '../types';

interface SimPlayer {
  name: string;
  hand: Card[];
}

interface SimLog {
  id: number;
  text: string;
}

interface SimulationState {
  players: SimPlayer[];
  board: GameBoard;
  currentPlayerIndex: number;
  started: boolean;
  running: boolean;
  timeLeft: number;
  moveCount: number;
  winner: string | null;
  log: SimLog[];
}

const SUITS: Card['suit'][] = ['hearts', 'diamonds', 'clubs', 'spades'];
const PLAYER_NAMES = ['You', 'a', 'b', 'c'];
const TIMER_SECONDS = 5;
const CARD_ASSET_VERSION = 'v6';
const SUIT_LETTERS: Record<Card['suit'], string> = { hearts: 'H', diamonds: 'D', clubs: 'C', spades: 'S' };
const SUIT_SYMBOLS: Record<Card['suit'], string> = { hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠' };

const emptyBoard = (): GameBoard => ({
  hearts: { up: [], down: [] },
  diamonds: { up: [], down: [] },
  clubs: { up: [], down: [] },
  spades: { up: [], down: [] },
});

const initialState = (): SimulationState => ({
  players: PLAYER_NAMES.map((name) => ({ name, hand: [] })),
  board: emptyBoard(),
  currentPlayerIndex: 0,
  started: false,
  running: false,
  timeLeft: TIMER_SECONDS,
  moveCount: 0,
  winner: null,
  log: [{ id: 0, text: 'Press start to deal four hands.' }],
});

const rankLabel = (rank: number): string => ({ 1: 'A', 11: 'J', 12: 'Q', 13: 'K' }[rank] || String(rank));
const cardLabel = (card: Card): string => `${rankLabel(card.rank)}${SUIT_SYMBOLS[card.suit]}`;
const cardFile = (card: Card): string => `${rankLabel(card.rank)}${SUIT_LETTERS[card.suit]}.svg`;
const cardSrc = (card: Card): string => `${import.meta.env.BASE_URL}images/cards/${cardFile(card)}?${CARD_ASSET_VERSION}`;

const sortHand = (cards: Card[]): Card[] => {
  const suitOrder = new Map(SUITS.map((suit, index) => [suit, index]));
  return [...cards].sort((a, b) => (suitOrder.get(a.suit) || 0) - (suitOrder.get(b.suit) || 0) || b.rank - a.rank);
};

const createDeck = (): Card[] => SUITS.flatMap((suit) => Array.from({ length: 13 }, (_, index) => ({ suit, rank: index + 1 })));

const seededShuffle = (cards: Card[]): Card[] => {
  let seed = 7_777;
  const random = () => {
    seed = (seed * 16_807) % 2_147_483_647;
    return (seed - 1) / 2_147_483_646;
  };

  const shuffled = [...cards];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
};

const suitStarted = (board: GameBoard, suit: Card['suit']): boolean =>
  board[suit].up.includes(7) || board[suit].down.includes(7);

const isPlayable = (board: GameBoard, card: Card): boolean => {
  const pile = board[card.suit];
  if (!suitStarted(board, card.suit)) return card.rank === 7;

  if (card.rank === 7) return false;

  const highest = pile.up.length ? Math.max(...pile.up) : 7;
  const lowest = pile.down.length ? Math.min(...pile.down) : 7;

  return card.rank === highest + 1 || card.rank === lowest - 1;
};

const validMoves = (board: GameBoard, hand: Card[]): Card[] =>
  sortHand(hand.filter((card) => isPlayable(board, card)));

const placeCard = (board: GameBoard, card: Card): GameBoard => {
  const nextBoard: GameBoard = {
    hearts: { up: [...board.hearts.up], down: [...board.hearts.down] },
    diamonds: { up: [...board.diamonds.up], down: [...board.diamonds.down] },
    clubs: { up: [...board.clubs.up], down: [...board.clubs.down] },
    spades: { up: [...board.spades.up], down: [...board.spades.down] },
  };
  const pile = nextBoard[card.suit];

  if (card.rank >= 7) {
    if (!pile.up.includes(card.rank)) pile.up.push(card.rank);
    pile.up.sort((a, b) => a - b);
  } else {
    if (!pile.down.includes(card.rank)) pile.down.push(card.rank);
    pile.down.sort((a, b) => b - a);
  }

  return nextBoard;
};

const visibleBoardRanks = (board: GameBoard, suit: Card['suit']): number[] => {
  const ranks = Array.from(new Set([...board[suit].up, ...board[suit].down])).sort((a, b) => b - a);
  if (ranks.length <= 4) return ranks;

  const highest = ranks[0];
  const lowest = ranks[ranks.length - 1];
  const middle = ranks.includes(7) && highest !== 7 && lowest !== 7 ? [7] : [];
  return [highest, ...middle, lowest];
};

const withLog = (state: SimulationState, text: string): SimulationState => ({
  ...state,
  log: [{ id: state.moveCount + state.log.length + 1, text }, ...state.log].slice(0, 8),
});

const advanceTurn = (state: SimulationState): SimulationState => {
  if (!state.started || state.winner) return state;

  const player = state.players[state.currentPlayerIndex];
  const moves = validMoves(state.board, player.hand);
  let nextState = state;

  if (moves.length > 0) {
    const card = moves[0];
    const nextPlayers = state.players.map((candidate, index) => {
      if (index !== state.currentPlayerIndex) return candidate;
      return {
        ...candidate,
        hand: sortHand(candidate.hand.filter((held) => !(held.suit === card.suit && held.rank === card.rank))),
      };
    });
    const nextBoard = placeCard(state.board, card);
    const winner = nextPlayers[state.currentPlayerIndex].hand.length === 0 ? player.name : null;

    nextState = withLog({
      ...state,
      players: nextPlayers,
      board: nextBoard,
      winner,
      running: winner ? false : state.running,
      moveCount: state.moveCount + 1,
    }, `${player.name} played ${cardLabel(card)}`);

    if (winner) return withLog(nextState, `${winner} wins the simulated round.`);
  } else {
    nextState = withLog({ ...state, moveCount: state.moveCount + 1 }, `${player.name} passed`);
  }

  return {
    ...nextState,
    currentPlayerIndex: (state.currentPlayerIndex + 1) % state.players.length,
    timeLeft: TIMER_SECONDS,
  };
};

const dealSimulation = (): SimulationState => {
  const deck = seededShuffle(createDeck());
  const players = PLAYER_NAMES.map((name) => ({ name, hand: [] as Card[] }));
  deck.forEach((card, index) => players[index % players.length].hand.push(card));
  players.forEach((player) => {
    player.hand = sortHand(player.hand);
  });

  const sevenHeartsOwner = players.findIndex((player) => player.hand.some((card) => card.suit === 'hearts' && card.rank === 7));
  players[sevenHeartsOwner].hand = players[sevenHeartsOwner].hand.filter((card) => !(card.suit === 'hearts' && card.rank === 7));

  const board = placeCard(emptyBoard(), { suit: 'hearts', rank: 7 });
  const currentPlayerIndex = (sevenHeartsOwner + 1) % players.length;

  return {
    players,
    board,
    currentPlayerIndex,
    started: true,
    running: true,
    timeLeft: TIMER_SECONDS,
    moveCount: 0,
    winner: null,
    log: [
      { id: 2, text: `${players[currentPlayerIndex].name} starts after 7♥ opens the table.` },
      { id: 1, text: `${players[sevenHeartsOwner].name} had 7♥ — placed automatically.` },
    ],
  };
};

const SimulationScreen: React.FC = () => {
  const [sim, setSim] = useState<SimulationState>(() => initialState());
  const currentPlayer = sim.players[sim.currentPlayerIndex];
  const currentMoves = useMemo(() => currentPlayer ? validMoves(sim.board, currentPlayer.hand) : [], [currentPlayer, sim.board]);

  useEffect(() => {
    if (!sim.running || sim.winner || !sim.started) return undefined;

    const interval = window.setInterval(() => {
      setSim((current) => {
        if (!current.running || current.winner || !current.started) return current;
        if (current.timeLeft > 1) return { ...current, timeLeft: current.timeLeft - 1 };
        return advanceTurn({ ...current, timeLeft: TIMER_SECONDS });
      });
    }, 1000);

    return () => window.clearInterval(interval);
  }, [sim.running, sim.started, sim.winner]);

  const start = () => setSim(dealSimulation());
  const step = () => setSim((current) => advanceTurn({ ...current, running: false, timeLeft: TIMER_SECONDS }));
  const toggleRunning = () => setSim((current) => current.started && !current.winner ? { ...current, running: !current.running } : current);
  const reset = () => setSim(initialState());
  const fastForward = () => {
    setSim((current) => {
      let next = { ...current, running: false };
      for (let index = 0; index < 160 && next.started && !next.winner; index += 1) next = advanceTurn(next);
      return next;
    });
  };

  return (
    <main className="screen simulation-screen">
      <div className="app-shell simulation-shell">
        <header className="simulation-header">
          <GameDeskLink />
          <div>
            <span className="eyebrow">Simulation lab</span>
            <h1>Four players. Five-second turns.</h1>
            <p>Fast test a full table without opening room links on every device.</p>
          </div>
          <div className="simulation-header-actions">
            <a className="quiet-button" href={import.meta.env.BASE_URL}>Lobby</a>
          </div>
        </header>

        <section className="simulation-controls" aria-label="Simulation controls">
          <button className="primary-button" onClick={start}>{sim.started ? 'Restart deal' : 'Start simulation'}</button>
          <button className="secondary-button" onClick={toggleRunning} disabled={!sim.started || Boolean(sim.winner)}>{sim.running ? 'Pause' : 'Resume'}</button>
          <button className="secondary-button" onClick={step} disabled={!sim.started || Boolean(sim.winner)}>Step</button>
          <button className="secondary-button" onClick={fastForward} disabled={!sim.started || Boolean(sim.winner)}>Fast-forward</button>
          <button className="quiet-button" onClick={reset}>Reset</button>
        </section>

        <section className="simulation-status">
          <div>
            <span>{sim.winner ? 'Winner' : sim.started ? 'Current turn' : 'Ready'}</span>
            <strong>{sim.winner || currentPlayer?.name || 'Deal cards'}</strong>
          </div>
          <div>
            <span>Timer</span>
            <strong>{sim.started && !sim.winner ? `${sim.timeLeft}s` : '—'}</strong>
          </div>
          <div>
            <span>Moves</span>
            <strong>{sim.moveCount}</strong>
          </div>
          <div>
            <span>Playable</span>
            <strong>{currentMoves.length}</strong>
          </div>
        </section>

        <section className="simulation-table">
          <div className="simulation-players">
            {sim.players.map((player, index) => (
              <article key={player.name} className={`simulation-player ${index === sim.currentPlayerIndex && sim.started && !sim.winner ? 'is-current' : ''} ${player.name === sim.winner ? 'is-winner' : ''}`}>
                <span className="simulation-avatar">{player.name.charAt(0).toUpperCase()}</span>
                <div>
                  <strong>{player.name}</strong>
                  <small>{player.hand.length} cards</small>
                </div>
              </article>
            ))}
          </div>

          <div className="simulation-board" aria-label="Simulated board">
            {SUITS.map((suit) => (
              <div key={suit} className="simulation-pile" data-suit={suit}>
                <span className="simulation-suit">{SUIT_SYMBOLS[suit]}</span>
                <div className="simulation-pile-cards">
                  {visibleBoardRanks(sim.board, suit).length === 0 && <span className="simulation-empty">empty</span>}
                  {visibleBoardRanks(sim.board, suit).map((rank) => {
                    const card = { suit, rank };
                    return <img key={`${suit}-${rank}`} src={cardSrc(card)} alt={cardLabel(card)} decoding="async" />;
                  })}
                </div>
              </div>
            ))}
          </div>

          <div className="simulation-hands">
            {sim.players.map((player) => (
              <article key={player.name} className="simulation-hand">
                <div className="simulation-hand-title"><strong>{player.name}</strong><span>{player.hand.length}</span></div>
                <div className="simulation-card-row">
                  {player.hand.map((card) => (
                    <img key={`${player.name}-${card.suit}-${card.rank}`} src={cardSrc(card)} alt={cardLabel(card)} decoding="async" />
                  ))}
                </div>
              </article>
            ))}
          </div>
        </section>

        <aside className="simulation-log" aria-label="Simulation log">
          {sim.log.map((entry) => <p key={entry.id}>{entry.text}</p>)}
        </aside>
      </div>
    </main>
  );
};

export default SimulationScreen;
