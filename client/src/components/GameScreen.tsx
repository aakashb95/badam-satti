import React, { useEffect, useState } from 'react';
import { Card, GameState } from '../types';
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
}

const GameScreen: React.FC<GameScreenProps> = ({
  gameState,
  myCards,
  validMoves,
  isMyTurn,
  canPass,
  onPlayCard,
  onPassTurn,
  onLeaveGame,
}) => {
  const [timeLeft, setTimeLeft] = useState(20);
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    if (isMyTurn) {
      setTimeLeft(20);
      const interval = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev > 0) return prev - 1;
          return 0;
        });
      }, 1000);

      return () => clearInterval(interval);
    }
  }, [isMyTurn]);

  // Reset card hover states when clicking outside
  useEffect(() => {
    const handleBodyClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.hand-card')) {
        // Reset any stuck hover states by briefly adding a reset class
        const cards = document.querySelectorAll('.hand-card');
        cards.forEach(card => {
          card.classList.add('reset-transform');
          setTimeout(() => card.classList.remove('reset-transform'), 10);
        });
      }
    };

    document.body.addEventListener('click', handleBodyClick);
    return () => document.body.removeEventListener('click', handleBodyClick);
  }, []);

  const getRankDisplay = (rank: number): string => {
    if (rank === 1) return 'A';
    if (rank === 11) return 'J';
    if (rank === 12) return 'Q';
    if (rank === 13) return 'K';
    return rank.toString();
  };

  const getSuitSymbol = (suit: string): string => {
    const symbols: Record<string, string> = {
      hearts: '♥',
      diamonds: '♦',
      clubs: '♣',
      spades: '♠',
    };
    return symbols[suit] || suit;
  };

  const getSuitName = (suit: string): string => {
    const names: Record<string, string> = {
      hearts: 'Hearts',
      diamonds: 'Diamonds',
      clubs: 'Clubs',
      spades: 'Spades',
    };
    return names[suit] || suit;
  };

  const getCardFilename = (card: Card): string => {
    const suitLetters: Record<string, string> = { hearts: 'H', diamonds: 'D', clubs: 'C', spades: 'S' };
    const rankMap: Record<number, string> = { 1: 'A', 11: 'J', 12: 'Q', 13: 'K' };
    const rankPart = rankMap[card.rank] || card.rank.toString();
    return `${rankPart}${suitLetters[card.suit]}.svg`;
  };

  const isValidMove = (card: Card): boolean => {
    return validMoves.some(move => move.suit === card.suit && move.rank === card.rank);
  };

  const getWarningLevel = (player: any) => {
    // Use server-provided indicator data
    return player.indicator || 'none';
  };


  const renderBoard = () => {
    if (!gameState) return null;

    const suitOrder = ['hearts', 'diamonds', 'clubs', 'spades'];

    return (
      <div id="game-board">
        {suitOrder.map((suit) => {
          const suitObj = gameState.board[suit as keyof typeof gameState.board];
          const upCards = (suitObj.up || []).slice(); // Cards above 7 (8, 9, 10, etc.)
          const downCards = (suitObj.down || []).slice(); // Cards below 7 (6, 5, 4, etc.)
          
          // Build the complete sequence from highest to lowest
          // Server sends: up=[8,9,10], down=[6,5] for sequence 10,9,8,7,6,5
          let allRanks: number[] = [];
          
          if (upCards.length > 0 || downCards.length > 0) {
            // Build complete sequence from server data
            // Server stores 7 in up array, so don't manually add it
            const upSequence = upCards.slice().sort((a, b) => b - a); // Sort descending: [10,9,8,7]
            const downSequence = downCards.slice().sort((a, b) => b - a); // Sort descending: [6,5]
            
            allRanks = [...upSequence, ...downSequence];
          }

          const MAX_VISIBLE_CARDS = 3;
          let ranksForDisplay = allRanks;

          if (allRanks.length > MAX_VISIBLE_CARDS) {
            // Show key cards ensuring 7 is always visible when present
            const sevenIndex = allRanks.indexOf(7);
            
            if (sevenIndex !== -1) {
              // 7 is in sequence - always show it as the middle card
              ranksForDisplay = [
                allRanks[0], // Highest
                allRanks[sevenIndex], // 7 (the key base card)
                allRanks[allRanks.length - 1] // Lowest
              ];
            } else {
              // 7 not in sequence - use regular middle
              ranksForDisplay = [
                allRanks[0], // Highest
                allRanks[Math.floor(allRanks.length / 2)], // Middle
                allRanks[allRanks.length - 1] // Lowest
              ];
            }
          }

          return (
            <div key={suit} className="suit-area" data-suit={suit}>
              <div className="suit-header">
                {getSuitSymbol(suit)}<span className="suit-name">{getSuitName(suit)}</span>
              </div>
              <div className="cards-display">
                {ranksForDisplay.map((rank, idx) => {
                  const card = { suit: suit as Card['suit'], rank };
                  const isKeyCard = allRanks.length > MAX_VISIBLE_CARDS;
                  const spacing = isKeyCard ? -20 : -40;

                  return (
                    <img
                      key={`${rank}-${idx}`}
                      src={`/images/cards/${getCardFilename(card)}`}
                      loading="lazy"
                      className={`board-card-img ${isKeyCard ? 'key-card' : ''}`}
                      style={{ marginTop: idx === 0 ? 0 : spacing }}
                      title={isKeyCard
                        ? `${getRankDisplay(rank)} of ${getSuitName(suit)} (${allRanks.length} cards total)`
                        : ''
                      }
                      alt={`${getRankDisplay(rank)} of ${getSuitName(suit)}`}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const renderPlayersInfo = () => {
    if (!gameState) return null;

    const currentPlayer = gameState.players.find(p => p.isCurrentPlayer);
    const otherPlayers = gameState.players.filter(p => !p.isCurrentPlayer);

    return (
      <div className="players-info-mobile">
        <div id="players-info">
          {currentPlayer && (
            <div className={`current-player-indicator ${
              getWarningLevel(currentPlayer) === 'critical' ? 'critical-warning' :
              getWarningLevel(currentPlayer) === 'warning' ? 'warning-indicator' : ''
            }`}>
              <div className="current-player-info">
                <span className="current-player-name">{currentPlayer.name}</span>
                <span className="current-player-turn">{isMyTurn ? "Your Turn" : "Current Turn"}</span>
              </div>
              <div className="current-player-details">
                <span className="current-player-cards">{currentPlayer.cardCount} cards</span>
              </div>
            </div>
          )}

          {otherPlayers.length > 0 && (
            <div className="other-players-list">
              {otherPlayers.map((player) => {
                const warningLevel = getWarningLevel(player);
                return (
                  <div
                    key={player.name}
                    className={`player-info ${
                      player.connected ? 'connected' : 'disconnected'
                    } ${warningLevel === 'critical' ? 'critical-warning' : ''} ${warningLevel === 'warning' ? 'warning-indicator' : ''}`}
                  >
                    <div className="player-name">{player.name}</div>
                    <div className="player-status-indicators">
                      <span className="card-count">
                        {player.cardCount}
                      </span>
                      {!player.connected && <span className="disconnected-icon">🔴</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderMyCards = () => {
    const suitOrder = ['hearts', 'diamonds', 'clubs', 'spades'];

    return (
      <div className="my-cards-section">
        <div className="cards-count">Your Cards: {myCards.length}</div>
        <div id="my-cards" className="my-cards-grid">
          {suitOrder.map((suit) => {
            const cardsOfSuit = myCards.filter(c => c.suit === suit);

            if (cardsOfSuit.length === 0) return null;

            return (
              <div key={suit} className="hand-suit">
                {cardsOfSuit.map((card) => {
                  const isValid = isValidMove(card);
                  const playClass = isMyTurn && isValid ? 'playable' : '';
                  
                  return (
                    <img
                      key={`${card.suit}-${card.rank}`}
                      src={`/images/cards/${getCardFilename(card)}`}
                      loading="lazy"
                      className={`hand-card ${isValid ? 'valid' : ''} ${playClass}`}
                      onClick={() => isMyTurn && isValid && onPlayCard(card)}
                      onTouchStart={() => {
                        // Reset hover states on touch devices
                        const element = document.activeElement as HTMLElement;
                        if (element) element.blur();
                      }}
                      alt={`${getRankDisplay(card.rank)} of ${getSuitName(card.suit)}`}
                    />
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="screen" id="game-screen">
      <div className="game-container">
        {/* Game Top Action Bar */}
        <div className="game-top-bar">
          <button
            className="mobile-pass-btn"
            onClick={onPassTurn}
            disabled={!isMyTurn || !canPass}
          >
            <span className="btn-icon">⏭️</span>
            <span className="btn-text">Pass</span>
          </button>
          <div className="game-info">
            <div id="round-display">Round {gameState?.round || 1}/{gameState?.maxRounds || 7}</div>
            {gameState?.gameStartMessage && (
              <div id="game-start-message" className="game-start-message">
                {gameState.gameStartMessage}
              </div>
            )}
            {isMyTurn && (
              <div id="turn-display" className="my-turn">
                {timeLeft > 0 ? `(${timeLeft}s)` : 'Your Turn'}
              </div>
            )}
          </div>
          <button className="help-icon-btn" onClick={() => setShowHelp(true)} title="Help">
            ℹ️
          </button>
          <button className="mobile-leave-btn" onClick={onLeaveGame}>
            <span className="btn-icon">🚪</span>
            <span className="btn-text">Leave</span>
          </button>
        </div>

        {/* Players Info */}
        {renderPlayersInfo()}

        {/* Game Board */}
        {renderBoard()}

        {/* Player's Cards */}
        {renderMyCards()}
      </div>
      
      {/* Help Modal */}
      <HelpModal isOpen={showHelp} onClose={() => setShowHelp(false)} />
    </div>
  );
};

export default GameScreen;