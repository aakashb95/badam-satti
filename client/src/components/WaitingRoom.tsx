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
  const copyRoomCode = async () => {
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(roomCode);
        onShowNotification('Room code copied to clipboard!');
      } else {
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = roomCode;
        document.body.appendChild(textArea);
        textArea.select();
        try {
          document.execCommand('copy');
          onShowNotification('Room code copied to clipboard!');
        } catch (err) {
          console.error('Failed to copy: ', err);
          onShowNotification('Failed to copy room code');
        }
        document.body.removeChild(textArea);
      }
    } catch (err) {
      console.error('Failed to copy: ', err);
      onShowNotification('Failed to copy room code');
    }
  };

  const copyRoomLink = async () => {
    const roomLink = `${window.location.origin}/r/${roomCode}`;
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(roomLink);
        onShowNotification('Room link copied to clipboard!');
      } else {
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = roomLink;
        document.body.appendChild(textArea);
        textArea.select();
        try {
          document.execCommand('copy');
          onShowNotification('Room link copied to clipboard!');
        } catch (err) {
          console.error('Failed to copy: ', err);
          onShowNotification('Failed to copy room link');
        }
        document.body.removeChild(textArea);
      }
    } catch (err) {
      console.error('Failed to copy: ', err);
      onShowNotification('Failed to copy room link');
    }
  };

  const isCreator = gameState?.players && gameState.players.length > 0 && gameState.players[0].name === username;

  return (
    <div className="screen">
      <div className="container">
        <h2>Room: <span>{roomCode}</span></h2>
        <div className="room-info">
          <p>Share with others to join!</p>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button onClick={copyRoomCode}>Copy Code</button>
            <button onClick={copyRoomLink} style={{ backgroundColor: '#2196F3' }}>Copy Link</button>
          </div>
          <div style={{ 
            marginTop: '10px', 
            padding: '8px', 
            backgroundColor: '#f5f5f5', 
            borderRadius: '4px',
            fontSize: '12px',
            color: '#666',
            wordBreak: 'break-all'
          }}>
            Link: {window.location.origin}/r/{roomCode}
          </div>
        </div>
        
        <div className="players-section">
          <h3>Players <span>({gameState?.players.length || 0}/11)</span></h3>
          <div id="players-list">
            {gameState?.players.map((player) => (
              <div
                key={player.name}
                className={`player-item ${player.connected ? 'connected' : 'disconnected'}`}
              >
                <span className="player-name">{player.name}</span>
                <span className="player-status">{player.connected ? '🔵' : '🔴'}</span>
              </div>
            ))}
          </div>
        </div>
        
        <div className="waiting-actions">
          {isCreator && (
            <button onClick={onStartGame}>
              Start Game
            </button>
          )}
          <button onClick={onLeaveRoom}>Leave Room</button>
        </div>
      </div>
    </div>
  );
};

export default WaitingRoom;