import React from 'react';

interface LoadingScreenProps {
  message: string;
}

const LoadingScreen: React.FC<LoadingScreenProps> = ({ message }) => {
  return (
    <div className="screen">
      <div className="container">
        <div className="loading-spinner"></div>
        <p>{message}</p>
      </div>
    </div>
  );
};

export default LoadingScreen;