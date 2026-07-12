import React, { useState } from 'react';
import HelpModal from './HelpModal';
import { ComfortSize } from '../types';
import GameDeskLink from './GameDeskLink';

interface MenuScreenProps {
  username: string;
  onCreateRoom: () => void;
  onJoinRoom: (roomCode: string) => void;
  comfortSize: ComfortSize;
  onComfortSizeChange: (size: ComfortSize) => void;
}

const LOBBY_GREETINGS = [
  { lead: 'Welcome', punctuation: '.' },
  { lead: 'Ready', punctuation: '?' },
  { lead: 'Table’s open', punctuation: '.' },
  { lead: 'All set', punctuation: '?' },
];

const LobbyGreeting: React.FC<{ username: string }> = ({ username }) => {
  const [greeting] = useState(() => LOBBY_GREETINGS[Math.floor(Math.random() * LOBBY_GREETINGS.length)] || LOBBY_GREETINGS[0]);

  return <h2>{greeting.lead}, <span>{username}</span>{greeting.punctuation}</h2>;
};

const MenuScreen: React.FC<MenuScreenProps> = ({ username, onCreateRoom, onJoinRoom, comfortSize, onComfortSizeChange }) => {
  const [roomCode, setRoomCode] = useState('');
  const [showHelpModal, setShowHelpModal] = useState(false);

  const handleJoinRoom = () => {
    onJoinRoom(roomCode);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleJoinRoom();
    }
  };

  const handleRoomCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setRoomCode(e.target.value.toUpperCase());
  };

  return (
    <main className="screen lobby-screen">
      <div className="app-shell menu-shell">
        <header className="app-header">
          <GameDeskLink />
          <div className="header-actions">
            <button className="quiet-button" onClick={() => setShowHelpModal(true)}>How to play</button>
          </div>
        </header>

        <section className="menu-hero">
          <span className="eyebrow game-lobby-label"><b aria-hidden="true">7♥</b> Badam Satti table</span>
          <LobbyGreeting username={username} />
          <p>Start a private room or enter a six-character invite code.</p>
        </section>

        <div className="menu-grid">
          <button className="action-card action-card-primary" onClick={onCreateRoom}>
            <span className="action-card-icon">＋</span>
            <span className="action-card-copy">
              <strong>Create a room</strong>
              <small>You set the table and invite everyone</small>
            </span>
            <span className="action-card-arrow">→</span>
          </button>

          <section className="action-card join-card">
            <span className="action-card-icon">⌁</span>
            <div className="action-card-copy">
              <strong>Join a room</strong>
              <small>Enter the code from your host</small>
            </div>
            <div className="code-entry">
              <input
                aria-label="Room code"
                type="text"
                value={roomCode}
                onChange={handleRoomCodeChange}
                onKeyDown={handleKeyPress}
                placeholder="ABC123"
                maxLength={6}
                autoComplete="off"
                inputMode="text"
              />
              <button className="code-submit" onClick={handleJoinRoom} disabled={roomCode.length !== 6}>Join</button>
            </div>
          </section>
        </div>

        <footer className="app-footer"><span>Classic rules</span><span>Seven rounds</span><a href={`${import.meta.env.BASE_URL}simulation`}>Simulation lab</a></footer>
      </div>
      <HelpModal 
        isOpen={showHelpModal} 
        onClose={() => setShowHelpModal(false)} 
        comfortSize={comfortSize}
        onComfortSizeChange={onComfortSizeChange}
      />
    </main>
  );
};

export default MenuScreen;
