import React, { useState } from 'react';

interface JoinRoomScreenProps {
  roomCode: string;
  onJoinRoom: (roomCode: string, username: string) => void;
  onBackToMenu: () => void;
  error?: string | null;
  onClearError?: () => void;
}

const JoinRoomScreen: React.FC<JoinRoomScreenProps> = ({ roomCode, onJoinRoom, onBackToMenu, error, onClearError }) => {
  const [username, setUsername] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (username.trim().length === 0) {
      return;
    }
    
    setIsSubmitting(true);
    onJoinRoom(roomCode, username.trim());
  };

  const handleUsernameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setUsername(e.target.value);
    // Clear error when user starts typing
    if (error && onClearError) {
      onClearError();
    }
  };

  return (
    <div className="screen">
      <div className="screen-content">
        <h2 style={{ textAlign: 'center', marginBottom: '20px' }}>Join Room</h2>
        
        <div style={{ textAlign: 'center', marginBottom: '30px' }}>
          <div style={{ 
            fontSize: '24px', 
            fontWeight: 'bold', 
            color: '#2196F3',
            marginBottom: '10px'
          }}>
            {roomCode}
          </div>
          <div style={{ color: '#666', fontSize: '14px' }}>
            You're joining this room
          </div>
        </div>

        {error && (
          <div style={{
            backgroundColor: '#ffebee',
            color: '#c62828',
            padding: '12px',
            borderRadius: '8px',
            marginBottom: '20px',
            fontSize: '14px',
            textAlign: 'center',
            border: '1px solid #ffcdd2'
          }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ width: '100%' }}>
          <div style={{ marginBottom: '20px' }}>
            <label htmlFor="username" style={{ 
              display: 'block', 
              marginBottom: '8px', 
              fontSize: '16px',
              fontWeight: 'bold'
            }}>
              Enter your name:
            </label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={handleUsernameChange}
              placeholder="Your name"
              maxLength={20}
              style={{
                width: '100%',
                padding: '12px',
                fontSize: '16px',
                border: '2px solid #ddd',
                borderRadius: '8px',
                outline: 'none',
                transition: 'border-color 0.3s ease',
                boxSizing: 'border-box'
              }}
              onFocus={(e) => (e.target as HTMLInputElement).style.borderColor = '#2196F3'}
              onBlur={(e) => (e.target as HTMLInputElement).style.borderColor = '#ddd'}
              disabled={isSubmitting}
              autoFocus
            />
          </div>

          <div style={{ display: 'flex', gap: '10px', width: '100%' }}>
            <button
              type="button"
              onClick={onBackToMenu}
              disabled={isSubmitting}
              style={{
                flex: 1,
                padding: '12px 20px',
                fontSize: '16px',
                backgroundColor: '#f5f5f5',
                color: '#333',
                border: 'none',
                borderRadius: '8px',
                cursor: isSubmitting ? 'not-allowed' : 'pointer',
                transition: 'background-color 0.3s ease',
                opacity: isSubmitting ? 0.6 : 1
              }}
              onMouseEnter={(e) => !isSubmitting && ((e.target as HTMLButtonElement).style.backgroundColor = '#e0e0e0')}
              onMouseLeave={(e) => !isSubmitting && ((e.target as HTMLButtonElement).style.backgroundColor = '#f5f5f5')}
            >
              Back
            </button>
            
            <button
              type="submit"
              disabled={username.trim().length === 0 || isSubmitting}
              style={{
                flex: 2,
                padding: '12px 20px',
                fontSize: '16px',
                backgroundColor: username.trim().length === 0 || isSubmitting ? '#ccc' : '#4CAF50',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: username.trim().length === 0 || isSubmitting ? 'not-allowed' : 'pointer',
                transition: 'background-color 0.3s ease'
              }}
              onMouseEnter={(e) => username.trim().length > 0 && !isSubmitting && ((e.target as HTMLButtonElement).style.backgroundColor = '#45a049')}
              onMouseLeave={(e) => username.trim().length > 0 && !isSubmitting && ((e.target as HTMLButtonElement).style.backgroundColor = '#4CAF50')}
            >
              {isSubmitting ? 'Joining...' : 'Join Room'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default JoinRoomScreen;