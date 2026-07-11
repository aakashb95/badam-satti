import React from 'react';
import { Winner, Card } from '../types';

interface GameOverScreenProps {
  winner: Winner | null;
  onContinueRound: () => void;
  onExitGame: () => void;
  showingDelay: boolean;
}

const CARD_ASSET_VERSION = 'v6';

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

  const getCardSrc = (card: Card): string => `/images/cards/${getCardFilename(card)}?${CARD_ASSET_VERSION}`;

  const renderRemainingCards = (cards: Card[]) => {
    if (!cards || cards.length === 0) return null;
    
    return (
      <div className="remaining-cards-visual">
        {cards.map((card, index) => (
          <img
            key={`${card.suit}-${card.rank}-${index}`}
            src={getCardSrc(card)}
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
      <main className="screen results-reveal-screen">
        <div className="results-reveal">
          <span className="eyebrow">Round complete</span>
          <div className="game-over-delay">
            <div className="reveal-seven">7<span>♥</span></div>
            <h1>Cards down.</h1>
            <p>Counting the table</p>
            <div className="loading-dots">
              <span></span>
              <span></span>
              <span></span>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="screen results-screen">
      <div className="app-shell results-shell">
        <header className="results-header">
          <span className="eyebrow">Round results</span>
          <h2><span>{winner?.winner}</span> takes the round.</h2>
          {winner?.message && <p>{winner.message}</p>}
        </header>
        <div id="winner-display">
        </div>
        <div id="final-scores">
          {winner?.finalScores && (
            <div className="final-scores">
              <div className="section-heading"><h3>This round</h3><span>Points added</span></div>
              <div className="scores-list">
                {winner.finalScores.map((score, index) => (
                  <div key={index} className="score-row">
                    <div className={`score-item ${score.isWinner ? 'winner' : ''}`}>
                      <div className="score-main">
                        <span className="score-rank">{String(index + 1).padStart(2, '0')}</span>
                        <div className="score-player">
                          <span className="player-name">{score.name}</span>
                          <small>{score.isWinner ? 'Round winner' : `${score.remainingCards?.length || 0} cards left`}</small>
                        </div>
                        <span className="player-score"><strong>{score.score}</strong> pts</span>
                      </div>
                      {score.remainingCards && score.remainingCards.length > 0 && (
                        <div className="remaining-cards">
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
          <button className="primary-button" onClick={onContinueRound}>Next round <span>→</span></button>
          <button className="secondary-button" onClick={onExitGame}>Finish game</button>
        </div>
      </div>
    </main>
  );
};

export default GameOverScreen;
