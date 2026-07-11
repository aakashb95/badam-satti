import React from 'react';

interface LoadingScreenProps {
  message: string;
}

const LoadingScreen: React.FC<LoadingScreenProps> = ({ message }) => {
  return (
    <main className="screen loading-screen">
      <div className="loading-content">
        <div className="shuffle-loader" aria-hidden="true"><span /><span /><span /></div>
        <span className="eyebrow">Badam Satti</span>
        <p>{message}</p>
      </div>
    </main>
  );
};

export default LoadingScreen;
