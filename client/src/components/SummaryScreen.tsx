import React from 'react';
import { GameSummary } from '../types';

interface SummaryScreenProps {
  summary: GameSummary | null;
  onReturnToMenu: () => void;
}

const SummaryScreen: React.FC<SummaryScreenProps> = ({ summary, onReturnToMenu }) => {
  return (
    <div className="screen">
      <div className="container">
        <h2>🏅 Game Summary</h2>
        <div id="summary-scores">
          {summary && (
            <div className="summary-content">
              <div className="game-result">
                <h3>🏆 Overall Winner: {summary.winner}</h3>
                <p>🥺 Last Place: {summary.loser}</p>
              </div>
              <div className="total-scores">
                <h4>Final Cumulative Scores:</h4>
                <div className="scores-list">
                  {summary.totals.map((total, index) => (
                    <div key={index} className="score-row">
                      <div className={`score-item ${total.name === summary.winner ? 'winner' : ''}`}>
                        <div className="score-main">
                          <div className="player-info">
                            <span className="rank">#{index + 1}</span>
                            <span className="player-name">{total.name}</span>
                          </div>
                          <span className="player-score">{total.totalScore} pts</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
        <div className="game-over-actions">
          <button onClick={onReturnToMenu}>Return to Menu</button>
        </div>
      </div>
    </div>
  );
};

export default SummaryScreen;