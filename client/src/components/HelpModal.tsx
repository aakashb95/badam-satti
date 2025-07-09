import React from 'react';

interface HelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const HelpModal: React.FC<HelpModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="help-modal-overlay" onClick={onClose}>
      <div className="help-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="help-modal-header">
          <h3>Badam7 Help</h3>
          <button className="help-close-btn" onClick={onClose}>×</button>
        </div>
        
        <div className="help-modal-body">
          <div className="help-section">
            <h4>🎯 Game Goal</h4>
            <p>Play all your cards first to win!</p>
          </div>

          <div className="help-section">
            <h4>🃏 How to Play</h4>
            <p>• Connect cards in sequence (6→7→8)</p>
            <p>• Same suit only (hearts with hearts)</p>
            <p>• Game starts with 7 of hearts</p>
          </div>

          <div className="help-section">
            <h4>🔍 Card Colors</h4>
            <p><span className="help-indicator green">🟢 Green border</span> = You can play this card</p>
            <p><span className="help-indicator normal">⚪ No border</span> = Can't play yet</p>
          </div>

          <div className="help-section">
            <h4>⚠️ Player Warnings</h4>
            <p><span className="help-indicator yellow">🟡 Yellow</span> = 3 or less page warning</p>
            <p><span className="help-indicator red">🔴 Red</span> = All pages sure!</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default HelpModal;