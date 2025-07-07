import React from 'react';

interface GameOverScreenProps {
  onContinueRound: () => void;
  onExitGame: () => void;
}

const GameOverScreen: React.FC<GameOverScreenProps> = ({ onContinueRound, onExitGame }) => {
  return (
    <div className="screen">
      <div className="container">
        <h2>🎉 Game Over!</h2>
        <div id="winner-display">
          {/* Winner display will be populated by the parent component when needed */}
        </div>
        <div id="final-scores">
          {/* Final scores will be populated by the parent component when needed */}
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