import React from 'react';
import { Winner, Card } from '../types';
import GameDeskLink from './GameDeskLink';
import { getCardSrc, getRankDisplay } from '../cards';

interface GameOverScreenProps {
  winner: Winner | null;
  username: string;
  onContinueRound: () => void;
  onExitGame: () => void;
  showingDelay: boolean;
  canContinueRound: boolean;
  hasMinimumPlayers: boolean;
  canFinishGame: boolean;
  onReturnToGameDesk: () => Promise<void>;
}

const GameOverScreen: React.FC<GameOverScreenProps> = ({
  winner,
  username,
  onContinueRound,
  onExitGame,
  showingDelay,
  canContinueRound,
  hasMinimumPlayers,
  canFinishGame,
  onReturnToGameDesk,
}) => {
  const isWinner = Boolean(winner?.winner && winner.winner === username);
  const confettiPieces = Array.from({ length: 14 }, (_, index) => index);
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
        <GameDeskLink onBeforeNavigate={onReturnToGameDesk} className="results-game-desk" />
        <div className="score-counting" aria-live="polite">
          <span className="eyebrow">Round complete</span>
          <strong>Counting scores</strong>
          <div className="loading-dots" aria-hidden="true">
            <span></span>
            <span></span>
            <span></span>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="screen results-screen">
      <div className="app-shell results-shell">
        <GameDeskLink onBeforeNavigate={onReturnToGameDesk} className="results-game-desk" />
        <header className="results-header">
          {isWinner && (
            <div className="winner-confetti round-winner-confetti" aria-hidden="true">
              {confettiPieces.map((piece) => <span key={piece} />)}
            </div>
          )}
          <span className="eyebrow">{isWinner ? 'Round won' : 'Round results'}</span>
          <h2>{isWinner ? 'You won!' : <><span>{winner?.winner}</span> won.</>}</h2>
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
                          <span className="player-name">{score.name === username ? 'You' : score.name}</span>
                          <small>{score.isWinner ? 'Round winner' : `${score.remainingCards?.length || 0} ${(score.remainingCards?.length || 0) === 1 ? 'card' : 'cards'} left`}</small>
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
        {!hasMinimumPlayers && <p className="results-player-notice">Need at least 3 players to play.</p>}
        <div className="game-over-actions">
          {canContinueRound && <button className="primary-button" onClick={onContinueRound}>Next round <span>→</span></button>}
          {canFinishGame && <button className={canContinueRound ? 'secondary-button' : 'primary-button'} onClick={onExitGame}>Finish game</button>}
          {!canFinishGame && !canContinueRound && hasMinimumPlayers && <p>Waiting for the host</p>}
        </div>
      </div>
    </main>
  );
};

export default GameOverScreen;
