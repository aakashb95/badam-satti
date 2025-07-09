import React, { useState } from 'react';
import HelpModal from './HelpModal';

interface MenuScreenProps {
  username: string;
  onCreateRoom: () => void;
  onJoinRoom: (roomCode: string) => void;
  onReconnectToRoom?: (roomCode: string) => void;
}

const MenuScreen: React.FC<MenuScreenProps> = ({ username, onCreateRoom, onJoinRoom, onReconnectToRoom }) => {
  const [roomCode, setRoomCode] = useState('');
  const [showHelpModal, setShowHelpModal] = useState(false);

  const handleJoinRoom = () => {
    onJoinRoom(roomCode);
  };

  const handleReconnectRoom = () => {
    if (onReconnectToRoom) {
      onReconnectToRoom(roomCode);
    }
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
    <div className="screen">
      <div className="container glass-panel">
        <h2>Welcome, {username}!</h2>
        <button 
          className="help-btn" 
          onClick={() => setShowHelpModal(true)}
          style={{
            backgroundColor: '#2196F3',
            color: 'white',
            border: 'none',
            padding: '8px 16px',
            borderRadius: '20px',
            fontSize: '14px',
            cursor: 'pointer',
            marginBottom: '20px',
            transition: 'background-color 0.3s ease'
          }}
          onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#1976D2'}
          onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#2196F3'}
        >
          ℹ️ How to Play
        </button>
        <div className="menu-options">
          <button className="menu-btn" onClick={onCreateRoom}>
            Create New Room
          </button>
          <div className="divider">OR</div>
          <div className="join-section">
            <input
              type="text"
              value={roomCode}
              onChange={handleRoomCodeChange}
              onKeyPress={handleKeyPress}
              placeholder="Enter Room Code"
              maxLength={6}
              autoComplete="off"
            />
            <button className="menu-btn" onClick={handleJoinRoom}>
              Join Room
            </button>
            {onReconnectToRoom && (
              <button className="menu-btn secondary" onClick={handleReconnectRoom}>
                Reconnect to Room
              </button>
            )}
          </div>
        </div>
      </div>
      <HelpModal 
        isOpen={showHelpModal} 
        onClose={() => setShowHelpModal(false)} 
      />
    </div>
  );
};

export default MenuScreen;