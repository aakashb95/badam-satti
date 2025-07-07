import React from 'react';

interface SummaryScreenProps {
  onReturnToMenu: () => void;
}

const SummaryScreen: React.FC<SummaryScreenProps> = ({ onReturnToMenu }) => {
  return (
    <div className="screen">
      <div className="container">
        <h2>🏅 Game Summary</h2>
        <div id="summary-scores">
          {/* Summary scores will be populated by the parent component when needed */}
        </div>
        <div className="game-over-actions">
          <button onClick={onReturnToMenu}>Return to Menu</button>
        </div>
      </div>
    </div>
  );
};

export default SummaryScreen;