import React, { useEffect, useMemo, useState } from 'react';
import { ComfortSize, GameState } from '../types';
import GameDeskLink from './GameDeskLink';
import HelpModal from './HelpModal';
import SoundToggle from './SoundToggle';

interface WaitingRoomProps {
  roomCode: string;
  gameState: GameState | null;
  username: string;
  gameEndedByDepartures: boolean;
  onStartGame: () => void;
  onLeaveRoom: () => void;
  onShowNotification: (message: string) => void;
  onReturnToGameDesk: () => Promise<void>;
  onSetTurnDuration: (seconds: number) => void;
  comfortSize: ComfortSize;
  onComfortSizeChange: (size: ComfortSize) => void;
  soundOn: boolean;
  onSoundChange: (value: boolean) => void;
}

const TURN_DURATION_CHOICES = [20, 40, 60];

const WaitingRoom: React.FC<WaitingRoomProps> = ({
  roomCode,
  gameState,
  username,
  gameEndedByDepartures,
  onStartGame,
  onLeaveRoom,
  onShowNotification,
  onReturnToGameDesk,
  onSetTurnDuration,
  comfortSize,
  onComfortSizeChange,
  soundOn,
  onSoundChange,
}) => {
  const [lanOrigin, setLanOrigin] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    const isLocalhost = ['localhost', '127.0.0.1'].includes(window.location.hostname);
    if (!isLocalhost) return;

    fetch('/api/network-info')
      .then((response) => response.ok ? response.json() : null)
      .then((data: { lanOrigin?: string } | null) => setLanOrigin(data?.lanOrigin || null))
      .catch(() => setLanOrigin(null));
  }, []);

  const inviteOrigin = useMemo(() => {
    const isLocalhost = ['localhost', '127.0.0.1'].includes(window.location.hostname);
    return isLocalhost && lanOrigin ? lanOrigin : window.location.origin;
  }, [lanOrigin]);
  const inviteLink = `${inviteOrigin}${import.meta.env.BASE_URL}r/${roomCode}`;

  const copy = async (text: string, successMessage: string) => {
    try {
      await navigator.clipboard.writeText(text);
      onShowNotification(successMessage);
    } catch {
      onShowNotification('Copy failed — select the text instead');
    }
  };

  const isCreator = gameState?.players && gameState.players.length > 0 && gameState.players[0].name === username;
  const playerCount = gameState?.players.length || 0;
  const connectedPlayerCount = gameState?.players.filter((player) => player.connected).length || 0;
  const turnDuration = gameState?.turnDurationSeconds ?? 20;
  const everyoneElseLeft = gameEndedByDepartures && connectedPlayerCount === 1;

  return (
    <main className="screen waiting-screen">
      <div className="app-shell waiting-shell">
        <header className="app-header">
          <GameDeskLink onBeforeNavigate={onReturnToGameDesk} />
          <div className="waiting-toolbar">
            <SoundToggle soundOn={soundOn} onSoundChange={onSoundChange} />
            <button className="round-icon-button" onClick={() => setShowHelp(true)} aria-label="How to play">?</button>
            <button className="round-icon-button leave-button" onClick={onLeaveRoom} aria-label="Leave room">×</button>
          </div>
        </header>

        <section className="waiting-heading">
          {everyoneElseLeft ? (
            <h2>Everyone has left the room</h2>
          ) : (
            <>
              <span className="eyebrow">{gameEndedByDepartures ? 'Game ended' : 'Private table'}</span>
              <h2>{gameEndedByDepartures ? 'Not enough players remain' : 'Waiting for players'}</h2>
              <p>
                {gameEndedByDepartures
                  ? 'Invite another player to start again.'
                  : isCreator
                    ? 'Invite your people, then start whenever everyone is ready.'
                    : 'The host will start the game when everyone is ready.'}
              </p>
            </>
          )}
        </section>

        <section className="invite-card">
          <div className="invite-copy">
            <span>Room code</span>
            <strong>{roomCode}</strong>
          </div>
          <div className="invite-actions">
            <button className="secondary-button" onClick={() => copy(roomCode, 'Room code copied')}>Copy code</button>
            <button className="primary-button" onClick={() => copy(inviteLink, 'Invite link copied')}>Share invite</button>
          </div>
          <div className="invite-link">{inviteLink}</div>
        </section>
        
        <section className="turn-speed-card">
          <div className="section-heading">
            <h3>Turn timer</h3>
            <span>{turnDuration} seconds each</span>
          </div>
          {isCreator ? (
            <>
              <div className="turn-speed-options" role="group" aria-label="Seconds each player gets per turn">
                {TURN_DURATION_CHOICES.map((seconds) => (
                  <button
                    key={seconds}
                    className={`turn-speed-option ${turnDuration === seconds ? 'is-selected' : ''}`}
                    aria-pressed={turnDuration === seconds}
                    onClick={() => onSetTurnDuration(seconds)}
                  >
                    {seconds}s
                  </button>
                ))}
              </div>
              <p className="turn-speed-note">When time runs out, a card is played automatically so the table keeps moving.</p>
            </>
          ) : (
            <p className="turn-speed-note">The host picks how long each turn lasts. When time runs out, a card is played automatically.</p>
          )}
        </section>

        <section className="players-section">
          <div className="section-heading">
            <h3>Players</h3>
            <span>{playerCount} / 11</span>
          </div>
          <div id="players-list">
            {gameState?.players.map((player, index) => (
              <div
                key={player.name}
                className={`player-item ${player.connected ? 'connected' : 'disconnected'}`}
              >
                <span className="player-avatar">{player.name.charAt(0).toUpperCase()}</span>
                <span className="player-item-copy">
                  <strong>{player.name}{player.name === username && <small> You</small>}</strong>
                  <small>{index === 0 ? 'Host' : player.connected ? 'Ready at the table' : 'Away'}</small>
                </span>
                {player.isDealer && <span className="dealer-badge" title="Dealer">Dealer</span>}
                <span className="connection-dot" aria-label={player.connected ? 'Connected' : 'Disconnected'} />
              </div>
            ))}
          </div>
        </section>
        
        <div className="waiting-actions">
          {isCreator && (
            <button className="primary-button start-button" onClick={onStartGame} disabled={connectedPlayerCount < 3}>
              {connectedPlayerCount < 3
                ? `Waiting for ${3 - connectedPlayerCount} more ${3 - connectedPlayerCount === 1 ? 'player' : 'players'}`
                : <>Start game <span>→</span></>}
            </button>
          )}
          {!isCreator && <div className="waiting-pulse"><span /> Waiting for the host</div>}
        </div>
      </div>
      <HelpModal
        isOpen={showHelp}
        onClose={() => setShowHelp(false)}
        comfortSize={comfortSize}
        onComfortSizeChange={onComfortSizeChange}
        onReturnToGameDesk={onReturnToGameDesk}
      />
    </main>
  );
};

export default WaitingRoom;
