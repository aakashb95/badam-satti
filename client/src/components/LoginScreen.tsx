import React, { ReactNode, useState, useEffect, useRef } from 'react';

interface LoginScreenProps {
  onContinue: (username: string) => void;
  themeToggle?: ReactNode;
}

const LoginScreen: React.FC<LoginScreenProps> = ({ onContinue, themeToggle }) => {
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Focus username input when component mounts
    const timer = setTimeout(() => {
      inputRef.current?.focus();
    }, 100);

    return () => clearTimeout(timer);
  }, []);

  const handleContinue = () => {
    const trimmedUsername = username.trim();
    if (!trimmedUsername) {
      setError('Tell the table what to call you.');
      return;
    }

    if (trimmedUsername.length > 20) {
      setError('Keep your name under 20 characters.');
      return;
    }

    onContinue(trimmedUsername);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleContinue();
    }
  };

  return (
    <main className="screen welcome-screen">
      <div className="welcome-shell">
        <section className="welcome-copy">
          {themeToggle && <div className="screen-corner-action">{themeToggle}</div>}
          <div className="brand-lockup">
            <span className="brand-mark">7<span>♥</span></span>
            <div className="brand-title">
              <h1>Badam Satti</h1>
              <span className="eyebrow">The classic card game</span>
            </div>
          </div>
          <div className="form-group welcome-form">
            <label htmlFor="player-name">Your name</label>
            <div className="field-action">
              <input
                id="player-name"
                ref={inputRef}
                type="text"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  setError('');
                }}
                onKeyDown={handleKeyPress}
                placeholder="Enter a name"
                maxLength={20}
                autoComplete="name"
              />
              <button className="icon-submit" onClick={handleContinue} aria-label="Continue">
                <span>→</span>
              </button>
            </div>
            <div className={`field-message ${error ? 'is-visible' : ''}`} role="status">{error || 'Up to 20 characters'}</div>
          </div>
          <div className="welcome-meta">
            <span>2–11 players</span>
            <span>Private rooms</span>
            <span>No sign-up</span>
          </div>
        </section>
      </div>
    </main>
  );
};

export default LoginScreen;
