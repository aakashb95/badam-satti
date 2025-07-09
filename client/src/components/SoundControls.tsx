import React, { useState, useEffect } from 'react';
import { audioManager } from '../utils/AudioManager';

interface SoundControlsProps {
  className?: string;
}

const SoundControls: React.FC<SoundControlsProps> = ({ className = '' }) => {
  const [isMuted, setIsMuted] = useState(audioManager.isMutedState());
  const [volume, setVolume] = useState(audioManager.getVolume());
  const [showVolumeSlider, setShowVolumeSlider] = useState(false);

  useEffect(() => {
    // Update local state when audio manager state changes
    setIsMuted(audioManager.isMutedState());
    setVolume(audioManager.getVolume());
  }, []);

  const handleMuteToggle = () => {
    audioManager.toggleMute();
    setIsMuted(audioManager.isMutedState());
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = parseFloat(e.target.value);
    audioManager.setVolume(newVolume);
    setVolume(newVolume);
    
    // If volume is set to 0, mute; if > 0 and muted, unmute
    if (newVolume === 0) {
      audioManager.mute();
      setIsMuted(true);
    } else if (newVolume > 0 && isMuted) {
      audioManager.unmute();
      setIsMuted(false);
    }
  };

  const handleTestSound = () => {
    audioManager.playCardPlayed();
  };

  return (
    <div className={`sound-controls ${className}`}>
      <button
        className="sound-toggle-btn"
        onClick={handleMuteToggle}
        title={isMuted ? 'Unmute sounds' : 'Mute sounds'}
      >
        {isMuted ? '🔇' : '🔊'}
      </button>
      
      <div className="volume-control">
        <button
          className="volume-btn"
          onClick={() => setShowVolumeSlider(!showVolumeSlider)}
          title="Volume control"
        >
          🎵
        </button>
        
        {showVolumeSlider && (
          <div className="volume-slider-container">
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={volume}
              onChange={handleVolumeChange}
              className="volume-slider"
              title={`Volume: ${Math.round(volume * 100)}%`}
            />
            <button
              className="test-sound-btn"
              onClick={handleTestSound}
              title="Test sound"
            >
              🔔
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default SoundControls;