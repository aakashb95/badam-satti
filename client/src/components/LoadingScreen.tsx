import React from 'react';
import GameDeskLink from './GameDeskLink';

interface LoadingScreenProps {
  message: string;
  onReturnToGameDesk: () => Promise<void>;
}

const LoadingScreen: React.FC<LoadingScreenProps> = ({ message, onReturnToGameDesk }) => {
  return (
    <main className="screen loading-screen">
      <div className="loading-content">
        <GameDeskLink onBeforeNavigate={onReturnToGameDesk} className="loading-game-desk" />
        <div className="shuffle-loader" aria-hidden="true"><span /><span /><span /></div>
        <span className="eyebrow">Badam Satti</span>
        <p>{message}</p>
      </div>
    </main>
  );
};

export default LoadingScreen;
