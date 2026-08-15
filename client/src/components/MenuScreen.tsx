import React, { useState } from 'react';
import HelpModal from './HelpModal';
import { ComfortSize } from '../types';
import GameDeskLink from './GameDeskLink';
import SoundToggle from './SoundToggle';

interface MenuScreenProps {
  username: string;
  onCreateRoom: () => void;
  onPlaySolo: (botCount: number) => void;
  onJoinRoom: (roomCode: string) => void;
  savedRoomCode?: string;
  onContinueRoom?: () => void;
  comfortSize: ComfortSize;
  onComfortSizeChange: (size: ComfortSize) => void;
  backgroundMusicOn: boolean;
  backgroundMusicVolume: number;
  gameSoundsOn: boolean;
  onBackgroundMusicChange: (value: boolean) => void;
  onBackgroundMusicVolumeChange: (value: number) => void;
  onGameSoundsChange: (value: boolean) => void;
}

const LOBBY_GREETINGS = [
  { lead: 'Welcome', punctuation: '.' },
  { lead: 'Ready', punctuation: '?' },
  { lead: 'Table’s open', punctuation: '.' },
  { lead: 'All set', punctuation: '?' },
];

const COMFORT_SIZES: ComfortSize[] = ['standard', 'large', 'extra-large', 'maximum'];
const COMFORT_BUTTON_LABELS: Record<ComfortSize, string> = { standard: 'A', large: 'A+', 'extra-large': 'A++', maximum: 'A+++' };
const BOT_COUNT_OPTIONS = Array.from({ length: 8 }, (_, index) => index + 3);

const LobbyGreeting: React.FC<{ username: string }> = ({ username }) => {
  const [greeting] = useState(() => LOBBY_GREETINGS[Math.floor(Math.random() * LOBBY_GREETINGS.length)] || LOBBY_GREETINGS[0]);

  return <h2>{greeting.lead}, <span>{username}</span>{greeting.punctuation}</h2>;
};

const MenuScreen: React.FC<MenuScreenProps> = ({
  username,
  onCreateRoom,
  onPlaySolo,
  onJoinRoom,
  savedRoomCode,
  onContinueRoom,
  comfortSize,
  onComfortSizeChange,
  backgroundMusicOn,
  backgroundMusicVolume,
  gameSoundsOn,
  onBackgroundMusicChange,
  onBackgroundMusicVolumeChange,
  onGameSoundsChange,
}) => {
  const [roomCode, setRoomCode] = useState('');
  const [botCount, setBotCount] = useState(3);
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

  const nextComfortSize = () => {
    const index = COMFORT_SIZES.indexOf(comfortSize);
    onComfortSizeChange(COMFORT_SIZES[(index + 1) % COMFORT_SIZES.length]);
  };

  return (
    <main className="screen lobby-screen">
      <div className="app-shell menu-shell">
        <header className="app-header">
          <GameDeskLink />
          <div className="header-actions">
            <SoundToggle
              backgroundMusicOn={backgroundMusicOn}
              backgroundMusicVolume={backgroundMusicVolume}
              gameSoundsOn={gameSoundsOn}
              onBackgroundMusicChange={onBackgroundMusicChange}
              onBackgroundMusicVolumeChange={onBackgroundMusicVolumeChange}
              onGameSoundsChange={onGameSoundsChange}
            />
            <button className="quiet-button" onClick={() => setShowHelpModal(true)}>How to play</button>
            <button
              className="text-size-button menu-text-size-button"
              onClick={nextComfortSize}
              aria-label={`Change text size. Current size ${COMFORT_BUTTON_LABELS[comfortSize]}`}
            >
              {COMFORT_BUTTON_LABELS[comfortSize]}
            </button>
          </div>
        </header>

        <section className="menu-hero">
          <span className="eyebrow game-lobby-label"><b aria-hidden="true">7♥</b> Badam 7 table</span>
          <LobbyGreeting username={username} />
          <p>Bring family to the table, join their room, or play a quick practice game against the computer.</p>
          {savedRoomCode && onContinueRoom && (
            <button className="quiet-button saved-room-button" onClick={onContinueRoom}>
              Continue room {savedRoomCode}
            </button>
          )}
        </section>

        <div className="menu-grid" aria-label="Ways to play">
          <button className="action-card action-card-primary" onClick={onCreateRoom}>
            <span className="action-card-icon">＋</span>
            <span className="action-card-copy">
              <strong>Play with family</strong>
              <small>Host a new room and share the invite code</small>
            </span>
            <span className="action-card-arrow">→</span>
          </button>

          <section className="action-card join-card">
            <span className="action-card-icon">⌁</span>
            <div className="action-card-copy">
              <strong>I have an invite code</strong>
              <small>Use the six characters your host sent you</small>
            </div>
            <div className="code-entry">
              <input
                aria-label="Room code"
                type="text"
                value={roomCode}
                onChange={handleRoomCodeChange}
                onKeyDown={handleKeyPress}
                placeholder="ENTER CODE"
                maxLength={6}
                autoComplete="off"
                inputMode="text"
              />
              <button className="code-submit" onClick={handleJoinRoom} disabled={roomCode.length !== 6}>Join room</button>
            </div>
          </section>

          <section className="action-card solo-card">
            <span className="action-card-icon" aria-hidden="true">♠</span>
            <span className="action-card-copy">
              <strong>Practice with computer</strong>
              <small>Choose how many computer players join your table</small>
            </span>
            <div className="solo-controls">
              <label className="bot-count-field">
                <span>Computer players</span>
                <select
                  aria-label="Number of computer players"
                  value={botCount}
                  onChange={(event) => setBotCount(Number(event.target.value))}
                >
                  {BOT_COUNT_OPTIONS.map((count) => <option key={count} value={count}>{count}</option>)}
                </select>
              </label>
              <button className="solo-start-button" onClick={() => onPlaySolo(botCount)}>
                Start practice <span aria-hidden="true">→</span>
              </button>
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
