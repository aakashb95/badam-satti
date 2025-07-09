import React from 'react';
import { Winner, Card } from '../types';

interface GameOverScreenProps {
  winner: Winner | null;
  onContinueRound: () => void;
  onExitGame: () => void;
  showingDelay: boolean;
}

const GameOverScreen: React.FC<GameOverScreenProps> = ({ winner, onContinueRound, onExitGame, showingDelay }) => {
  const getRankDisplay = (rank: number): string => {
    if (rank === 1) return 'A';
    if (rank === 11) return 'J';
    if (rank === 12) return 'Q';
    if (rank === 13) return 'K';
    return rank.toString();
  };

  const getCardFilename = (card: Card): string => {
    const suitLetters: Record<string, string> = { hearts: 'H', diamonds: 'D', clubs: 'C', spades: 'S' };
    const rankMap: Record<number, string> = { 1: 'A', 11: 'J', 12: 'Q', 13: 'K' };
    const rankPart = rankMap[card.rank] || card.rank.toString();
    return `${rankPart}${suitLetters[card.suit]}.svg`;
  };

  const renderRemainingCards = (cards: Card[]) => {
    if (!cards || cards.length === 0) return null;
    
    return (
      <div className="remaining-cards-visual">
        {cards.map((card, index) => (
          <img
            key={`${card.suit}-${card.rank}-${index}`}
            src={`/images/cards/${getCardFilename(card)}`}
            loading="lazy"
            className="mini-card"
            alt={`${getRankDisplay(card.rank)} of ${card.suit}`}
            title={`${getRankDisplay(card.rank)} of ${card.suit}`}
          />
        ))}
      </div>
    );
  };
  if (showingDelay) {
    return (
      <div className="screen">
        <div className="container">
          <div className="game-over-delay">
            <h1>🎉 Game Over! 🎉</h1>
            <div className="loading-dots">
              <span></span>
              <span></span>
              <span></span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="screen">
      <div className="container">
        <h2>🎉 Round Results</h2>
        <div id="winner-display">
          {winner && (
            <div className="winner-info">
              <h3>🏆 Winner: {winner.winner}</h3>
              {winner.message && <p>{winner.message}</p>}
            </div>
          )}
        </div>
        <div id="final-scores">
          {winner?.finalScores && (
            <div className="final-scores">
              <h4>Final Scores:</h4>
              <div className="scores-list">
                {winner.finalScores.map((score, index) => (
                  <div key={index} className="score-row">
                    <div className={`score-item ${score.isWinner ? 'winner' : ''}`}>
                      <div className="score-main">
                        <div className="player-info">
                          <span className="player-name">{score.name}</span>
                        </div>
                        <span className="player-score">{score.score} pts</span>
                      </div>
                      {score.remainingCards && score.remainingCards.length > 0 && (
                        <div className="remaining-cards">
                          <span className="remaining-cards-label">Remaining cards:</span>
                          {renderRemainingCards(score.remainingCards)}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="game-over-actions">
          <button onClick={onContinueRound}>Continue Round</button>
          <button onClick={onExitGame}>Exit Game</button>
        </div>
      </div>
    </div>
  );
};

export default GameOverScreen;