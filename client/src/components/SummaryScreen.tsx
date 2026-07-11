import React from 'react';
import { GameSummary } from '../types';

interface SummaryScreenProps {
  summary: GameSummary | null;
  username: string;
  onReturnToMenu: () => void;
}

const CONFETTI_PIECES = Array.from({ length: 14 }, (_, index) => index);

const SummaryScreen: React.FC<SummaryScreenProps> = ({ summary, username, onReturnToMenu }) => {
  const isWinner = Boolean(summary?.winner && summary.winner === username);

  return (
    <main className="screen results-screen summary-screen">
      <div className="app-shell results-shell">
        <header className="results-header">
          {isWinner && (
            <div className="winner-confetti" aria-hidden="true">
              {CONFETTI_PIECES.map((piece) => <span key={piece} />)}
            </div>
          )}
          <span className="eyebrow">Seven rounds complete</span>
          <h2><span>{summary?.winner}</span> rules the table.</h2>
          <p>Lowest total takes the crown. Until the rematch, anyway.</p>
        </header>
        <div id="summary-scores">
          {summary && (
            <div className="summary-content">
              <div className="total-scores">
                <div className="section-heading"><h3>Final standings</h3><span>Lowest score wins</span></div>
                <div className="scores-list">
                  {summary.totals.map((total, index) => (
                    <div key={index} className="score-row">
                      <div className={`score-item ${total.name === summary.winner ? 'winner' : ''}`}>
                        <div className="score-main">
                          <span className="score-rank">{String(index + 1).padStart(2, '0')}</span>
                          <div className="score-player">
                            <span className="player-name">{total.name}</span>
                            <small>{total.name === summary.winner ? 'Table champion' : total.name === summary.loser ? 'Ready for a rematch' : 'Well played'}</small>
                          </div>
                          <span className="player-score"><strong>{total.totalScore}</strong> pts</span>
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
          <button className="primary-button" onClick={onReturnToMenu}>Return to lobby <span>→</span></button>
        </div>
      </div>
    </main>
  );
};

export default SummaryScreen;
