import React, { useState } from 'react';

interface MenuScreenProps {
  username: string;
  onCreateRoom: () => void;
  onJoinRoom: (roomCode: string) => void;
}

const MenuScreen: React.FC<MenuScreenProps> = ({ username, onCreateRoom, onJoinRoom }) => {
  const [roomCode, setRoomCode] = useState('');

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
    <div className="screen">
      <div className="container glass-panel">
        <h2>Welcome, {username}!</h2>
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
          </div>
        </div>
      </div>
    </div>
  );
};

export default MenuScreen;