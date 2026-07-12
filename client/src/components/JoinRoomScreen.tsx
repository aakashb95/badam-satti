import React, { useEffect, useState } from 'react';
import GameDeskLink from './GameDeskLink';

interface JoinRoomScreenProps {
  roomCode: string;
  onJoinRoom: (roomCode: string, username: string) => void;
  onBackToMenu: () => void;
  error?: string | null;
  initialUsername?: string;
  onClearError?: () => void;
}

const JoinRoomScreen: React.FC<JoinRoomScreenProps> = ({ roomCode, onJoinRoom, onBackToMenu, error, initialUsername = '', onClearError }) => {
  const [username, setUsername] = useState(initialUsername);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (error) setIsSubmitting(false);
  }, [error]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (username.trim().length === 0) {
      return;
    }
    
    setIsSubmitting(true);
    onJoinRoom(roomCode, username.trim());
  };

  const handleUsernameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setUsername(e.target.value);
    // Clear error when user starts typing
    if (error && onClearError) {
      onClearError();
    }
  };

  return (
    <main className="screen join-screen">
      <div className="join-shell surface-panel">
        <div className="join-top-actions">
          <GameDeskLink />
          <button className="back-link" type="button" onClick={onBackToMenu} disabled={isSubmitting}>Back to Badam 7</button>
        </div>
        <div className="join-brand"><span className="brand-mark">7<span>♥</span></span></div>
        <span className="eyebrow">You’ve been invited</span>
        <h2>Take your seat</h2>
        <p className="join-intro">Enter your name to join the private table.</p>
        <div className="room-code-display" aria-label={`Room code ${roomCode}`}>
          {roomCode.split('').map((letter, index) => <span key={`${letter}-${index}`}>{letter}</span>)}
        </div>

        {error && (
          <div className="inline-error" role="alert">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="join-form">
          <div className="form-group">
            <label htmlFor="username">Your name</label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={handleUsernameChange}
              placeholder="Your name"
              maxLength={20}
              disabled={isSubmitting}
              autoFocus
              autoComplete="name"
            />
          </div>

            <button
              type="submit"
              disabled={username.trim().length === 0 || isSubmitting}
              className="primary-button full-button"
            >
              {isSubmitting ? 'Joining the table…' : <>Join room <span>→</span></>}
            </button>
        </form>
      </div>
    </main>
  );
};

export default JoinRoomScreen;
