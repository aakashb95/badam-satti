import React, { ReactNode, useEffect, useState } from 'react';
import { Card, GameState, Player } from '../types';
import HelpModal from './HelpModal';

interface GameScreenProps {
  gameState: GameState | null;
  myCards: Card[];
  validMoves: Card[];
  isMyTurn: boolean;
  canPass: boolean;
  username: string;
  onPlayCard: (card: Card) => void;
  onPassTurn: () => void;
  onLeaveGame: () => void;
  themeToggle?: ReactNode;
}

const SUITS: Card['suit'][] = ['hearts', 'diamonds', 'clubs', 'spades'];
const SUIT_META: Record<Card['suit'], { symbol: string; label: string; short: string }> = {
  hearts: { symbol: '♥', label: 'Hearts', short: 'H' },
  diamonds: { symbol: '♦', label: 'Diamonds', short: 'D' },
  clubs: { symbol: '♣', label: 'Clubs', short: 'C' },
  spades: { symbol: '♠', label: 'Spades', short: 'S' },
};

const GameScreen: React.FC<GameScreenProps> = ({
  gameState,
  myCards,
  validMoves,
  isMyTurn,
  canPass,
  username,
  onPlayCard,
  onPassTurn,
  onLeaveGame,
  themeToggle,
}) => {
  const [timeLeft, setTimeLeft] = useState(20);
  const [showHelp, setShowHelp] = useState(false);
  const [pendingCard, setPendingCard] = useState<string | null>(null);

  useEffect(() => {
    if (!isMyTurn) {
      setTimeLeft(20);
      return;
    }

    setTimeLeft(20);
    const interval = window.setInterval(() => {
      setTimeLeft((previous) => Math.max(0, previous - 1));
    }, 1000);

    return () => window.clearInterval(interval);
  }, [isMyTurn, gameState?.currentPlayerName]);

  useEffect(() => {
    setPendingCard(null);
  }, [isMyTurn, myCards]);

  const getRankDisplay = (rank: number): string => {
    if (rank === 1) return 'A';
    if (rank === 11) return 'J';
    if (rank === 12) return 'Q';
    if (rank === 13) return 'K';
    return rank.toString();
  };

  const getCardFilename = (card: Card): string => {
    const suitLetters: Record<Card['suit'], string> = { hearts: 'H', diamonds: 'D', clubs: 'C', spades: 'S' };
    const rankMap: Record<number, string> = { 1: 'A', 11: 'J', 12: 'Q', 13: 'K' };
    return `${rankMap[card.rank] || card.rank}${suitLetters[card.suit]}.svg`;
  };

  const isValidMove = (card: Card): boolean =>
    validMoves.some((move) => move.suit === card.suit && move.rank === card.rank);

  const warningClass = (player: Player) => {
    if (player.indicator === 'critical') return 'critical-warning';
    if (player.indicator === 'warning') return 'warning-indicator';
    return '';
  };

  const renderPlayers = () => {
    if (!gameState) return null;

    return (
      <section
        className="table-players"
        style={{ '--player-count': gameState.players.length } as React.CSSProperties}
        aria-label="Players at the table"
      >
        {gameState.players.map((player) => (
          <div
            key={player.name}
            className={`table-player ${player.isCurrentPlayer ? 'is-current' : ''} ${player.name === username ? 'is-you' : ''} ${!player.connected ? 'is-disconnected' : ''} ${warningClass(player)}`}
          >
            <span className="table-player-avatar">{player.name.charAt(0).toUpperCase()}</span>
            <span className="table-player-copy">
              <strong>
                {player.name === username ? 'You' : player.name}
                {player.isDealer && <span className="dealer-chip" title="Dealer">D</span>}
              </strong>
              {player.isCurrentPlayer && <small>Playing now</small>}
            </span>
          </div>
        ))}
      </section>
    );
  };

  const renderBoard = () => {
    if (!gameState) return null;

    return (
      <section className="game-board" aria-label="Cards on the table">
        {SUITS.map((suit) => {
          const suitBoard = gameState.board[suit];
          const upSequence = [...(suitBoard.up || [])].sort((a, b) => b - a);
          const downSequence = [...(suitBoard.down || [])].sort((a, b) => b - a);
          const allRanks = Array.from(new Set([...upSequence, ...downSequence]));
          const maxVisibleCards = 3;
          let displayRanks = allRanks;

          if (allRanks.length > maxVisibleCards) {
            const highestRank = allRanks[0];
            const lowestRank = allRanks[allRanks.length - 1];
            displayRanks = [highestRank];
            if (allRanks.includes(7) && highestRank !== 7 && lowestRank !== 7) displayRanks.push(7);
            displayRanks.push(lowestRank);
          }

          return (
            <div key={suit} className={`suit-pile ${allRanks.length ? 'has-cards' : 'is-empty'}`} data-suit={suit}>
              <div className="cards-display">
                {!displayRanks.length && (
                  <div className="empty-pile" aria-label={`${SUIT_META[suit].label} pile is empty`}>
                    <span>{SUIT_META[suit].symbol}</span>
                  </div>
                )}
                {displayRanks.map((rank, index) => {
                  const card: Card = { suit, rank };
                  return (
                    <img
                      key={`${suit}-${rank}-${index}`}
                      src={`/images/cards/${getCardFilename(card)}`}
                      className={`board-card-img stack-${index}`}
                      alt={`${getRankDisplay(rank)} of ${SUIT_META[suit].label}`}
                      decoding="async"
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
      </section>
    );
  };

  const renderHand = () => (
    <section className={`hand-dock ${isMyTurn ? 'is-my-turn' : ''}`} aria-label="Your hand">
      <div className="hand-heading">
        <div className="hand-actions">
          <button className="pass-button" onClick={onPassTurn} disabled={!isMyTurn || !canPass}>Pass turn</button>
        </div>
      </div>

      <div className="hand-suits">
        {SUITS.map((suit) => {
          const cards = myCards.filter((card) => card.suit === suit);
          if (!cards.length) return null;

          return (
            <div key={suit} className="hand-suit" data-suit={suit}>
              <div className="hand-card-fan">
                {cards.map((card) => {
                  const valid = isValidMove(card);
                  const playable = isMyTurn && valid;
                  const cardKey = `${card.suit}-${card.rank}`;
                  return (
                    <button
                      key={cardKey}
                      className={`hand-card ${valid ? 'valid' : ''} ${playable ? 'playable' : ''} ${pendingCard === cardKey ? 'is-pending' : ''}`}
                      onClick={() => {
                        if (!playable || pendingCard) return;
                        setPendingCard(cardKey);
                        onPlayCard(card);
                      }}
                      disabled={!playable || pendingCard !== null}
                      aria-label={`${playable ? 'Play' : ''} ${getRankDisplay(card.rank)} of ${SUIT_META[card.suit].label}`.trim()}
                    >
                      <img src={`/images/cards/${getCardFilename(card)}`} alt="" decoding="async" />
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );

  return (
    <main className="game-screen">
      <div className="game-shell">
        <header className="game-top-bar">
          <div className="game-brand">
            <span className="brand-mark">7<span>♥</span></span>
            <div><strong>Badam Satti</strong><small>Round {gameState?.round || 1} of {gameState?.maxRounds || 7}</small></div>
          </div>

          <div className={`turn-status ${isMyTurn ? 'is-active' : ''}`}>
            {isMyTurn && <span className="turn-timer">{timeLeft}s</span>}
            <div>
              <strong>{isMyTurn ? 'Your turn' : `${gameState?.currentPlayerName || 'Player'} is playing`}</strong>
            </div>
          </div>

          <div className="game-toolbar">
            {themeToggle}
            <button className="round-icon-button" onClick={() => setShowHelp(true)} aria-label="How to play">?</button>
            <button className="round-icon-button leave-button" onClick={onLeaveGame} aria-label="Leave game">×</button>
          </div>
        </header>

        {renderPlayers()}
        {renderBoard()}
        {renderHand()}
      </div>
      <HelpModal isOpen={showHelp} onClose={() => setShowHelp(false)} />
    </main>
  );
};

export default GameScreen;
