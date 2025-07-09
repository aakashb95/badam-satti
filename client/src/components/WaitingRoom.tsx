import React from 'react';
import { GameState } from '../types';

interface WaitingRoomProps {
  roomCode: string;
  gameState: GameState | null;
  username: string;
  onStartGame: () => void;
  onLeaveRoom: () => void;
}

const WaitingRoom: React.FC<WaitingRoomProps> = ({
  roomCode,
  gameState,
  username,
  onStartGame,
  onLeaveRoom,
}) => {
  const copyRoomCode = async () => {
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(roomCode);
        alert('Room code copied to clipboard!');
      } else {
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = roomCode;
        document.body.appendChild(textArea);
        textArea.select();
        try {
          document.execCommand('copy');
          alert('Room code copied to clipboard!');
        } catch (err) {
          console.error('Failed to copy: ', err);
          alert('Failed to copy room code');
        }
        document.body.removeChild(textArea);
      }
    } catch (err) {
      console.error('Failed to copy: ', err);
      alert('Failed to copy room code');
    }
  };

  const isCreator = gameState?.players && gameState.players.length > 0 && gameState.players[0].name === username;

  return (
    <div className="screen">
      <div className="container">
        <h2>Room: <span>{roomCode}</span></h2>
        <div className="room-info">
          <p>Share this code with others to join!</p>
          <button onClick={copyRoomCode}>Copy Code</button>
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