import React, { useState, useEffect } from 'react';
import { GameState, Card } from '../types';

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
  const [timeLeft, setTimeLeft] = useState(10);

  useEffect(() => {
    if (isMyTurn) {
      setTimeLeft(10);
      const interval = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev > 0) return prev - 1;
          return 0;
        });
      }, 1000);

      return () => clearInterval(interval);
    }
  }, [isMyTurn]);

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
    if (player.cardCount >= 3) return 'none';

    if (player.isCurrentPlayer) {
      const allCardsPlayable = myCards.length > 0 && myCards.length === validMoves.length;
      if (allCardsPlayable) {
        return 'critical';
      }
      return 'warning';
    }

    return 'warning';
  };

  const renderBoard = () => {
    if (!gameState) return null;

    const suitOrder = ['hearts', 'diamonds', 'clubs', 'spades'];

    return (
      <div id="game-board">
        {suitOrder.map((suit) => {
          const suitObj = gameState.board[suit as keyof typeof gameState.board];
          const lower = (suitObj.down || []).slice();
          const higher = (suitObj.up || []).slice().reverse();
          const allRanks = [...higher, ...lower];

          const MAX_VISIBLE_CARDS = 6;
          let ranksForDisplay = allRanks;

          if (allRanks.length > MAX_VISIBLE_CARDS) {
            ranksForDisplay = [];
            if (higher.length > 0) {
              ranksForDisplay.push(higher[0]);
            }
            if (higher.length > 0 || lower.length > 0) {
              ranksForDisplay.push(7);
            }
            if (lower.length > 0) {
              ranksForDisplay.push(lower[lower.length - 1]);
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
                <span className="current-player-turn">Current Turn</span>
              </div>
              <div className="current-player-details">
                <span className="current-player-cards">{currentPlayer.cardCount} cards</span>
                {getWarningLevel(currentPlayer) === 'critical' && <span className="warning-icon">🔴</span>}
                {getWarningLevel(currentPlayer) === 'warning' && <span className="warning-icon">🟡</span>}
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
                    } ${warningLevel === 'warning' ? 'warning-indicator' : ''}`}
                  >
                    <div className="player-name">{player.name}</div>
                    <div className="player-status-indicators">
                      <span className="connection-status">
                        {player.connected ? '🔵' : '🔴'}
                      </span>
                      {warningLevel === 'warning' && <span className="warning-icon">🟡</span>}
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
        <h3>Your Cards</h3>
        <div id="my-cards">
          {suitOrder.map((suit) => {
            const cardsOfSuit = myCards
              .filter(c => c.suit === suit)
              .sort((a, b) => a.rank - b.rank);

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
        {/* Mobile Top Action Bar */}
        <div className="mobile-top-bar">
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
            <div id="turn-display" className={isMyTurn ? 'my-turn' : 'other-turn'}>
              {isMyTurn ? `Your Turn${timeLeft > 0 ? ` (${timeLeft}s)` : ''}` : `${gameState?.currentPlayerName}'s Turn`}
            </div>
          </div>
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
    </div>
  );
};

export default GameScreen;