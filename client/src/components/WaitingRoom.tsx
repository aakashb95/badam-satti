import React from 'react';
import { GameState } from '../types';

interface WaitingRoomProps {
  roomCode: string;
  gameState: GameState | null;
  username: string;
  onStartGame: () => void;
  onLeaveRoom: () => void;
  onShowNotification: (message: string) => void;
}

const WaitingRoom: React.FC<WaitingRoomProps> = ({
  roomCode,
  gameState,
  username,
  onStartGame,
  onLeaveRoom,
  onShowNotification,
}) => {
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

  return (
    <main className="screen waiting-screen">
      <div className="app-shell waiting-shell">
        <header className="app-header">
          <div className="mini-brand"><span className="brand-mark">7<span>♥</span></span><span>Badam Satti</span></div>
          <button className="quiet-button danger-text" onClick={onLeaveRoom}>Leave room</button>
        </header>

        <section className="waiting-heading">
          <span className="eyebrow">Private table</span>
          <h2>Waiting for players</h2>
          <p>{isCreator ? 'Invite your people, then start whenever everyone is ready.' : 'The host will start the game when everyone is ready.'}</p>
        </section>

        <section className="invite-card">
          <div className="invite-copy">
            <span>Room code</span>
            <strong>{roomCode}</strong>
          </div>
          <div className="invite-actions">
            <button className="secondary-button" onClick={() => copy(roomCode, 'Room code copied')}>Copy code</button>
            <button className="primary-button" onClick={() => copy(`${window.location.origin}/r/${roomCode}`, 'Invite link copied')}>Share invite</button>
          </div>
          <div className="invite-link">{window.location.origin}/r/{roomCode}</div>
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
                  <small>{index === 0 ? 'Host' : player.connected ? 'Ready at the table' : 'Reconnecting'}</small>
                </span>
                {player.isDealer && <span className="dealer-badge" title="Dealer">Dealer</span>}
                <span className="connection-dot" aria-label={player.connected ? 'Connected' : 'Disconnected'} />
              </div>
            ))}
          </div>
        </section>
        
        <div className="waiting-actions">
          {isCreator && (
            <button className="primary-button start-button" onClick={onStartGame} disabled={playerCount < 2}>
              {playerCount < 2 ? 'Waiting for one more player' : <>Start game <span>→</span></>}
            </button>
          )}
          {!isCreator && <div className="waiting-pulse"><span /> Waiting for the host</div>}
        </div>
      </div>
    </main>
  );
};

export default WaitingRoom;
