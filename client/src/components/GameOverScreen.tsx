import React from 'react';
import { Winner } from '../types';

interface GameOverScreenProps {
  winner: Winner | null;
  onContinueRound: () => void;
  onExitGame: () => void;
}

const GameOverScreen: React.FC<GameOverScreenProps> = ({ winner, onContinueRound, onExitGame }) => {
  return (
    <div className="screen">
      <div className="container">
        <h2>🎉 Game Over!</h2>
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
                  <div key={index} className={`score-item ${score.isWinner ? 'winner' : ''}`}>
                    <span className="player-name">{score.name}</span>
                    <span className="player-score">{score.score} pts</span>
                    {score.isWinner && <span className="winner-badge">🏆</span>}
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