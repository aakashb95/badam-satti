import React, { useState, useEffect, useRef } from 'react';

interface LoginScreenProps {
  onContinue: (username: string) => void;
}

const LoginScreen: React.FC<LoginScreenProps> = ({ onContinue }) => {
  const [username, setUsername] = useState('');
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
      alert('Please enter your name');
      return;
    }

    if (trimmedUsername.length > 20) {
      alert('Name too long (max 20 characters)');
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
    <div className="screen">
      <div className="container glass-panel">
        <div className="logo-section">
          <img 
            src="/images/cards/7H.svg" 
            alt="7 of Hearts" 
            className="logo-card"
          />
          <h1>Badam Satti</h1>
        </div>
        <p className="subtitle">Play the classic card game with family</p>
        <div className="form-group">
          <input
            ref={inputRef}
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Enter your name"
            maxLength={20}
            autoComplete="off"
          />
          <button onClick={handleContinue}>Continue</button>
        </div>
      </div>
    </div>
  );
};

export default LoginScreen;