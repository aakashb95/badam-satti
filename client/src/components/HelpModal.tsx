import React from 'react';

interface HelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const HelpModal: React.FC<HelpModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="help-modal-overlay" onClick={onClose} role="presentation">
      <section className="help-modal-content" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="help-title">
        <div className="help-modal-header">
          <div><span className="eyebrow">A two-minute guide</span><h3 id="help-title">How to play</h3></div>
          <button className="help-close-btn" onClick={onClose} aria-label="Close help">×</button>
        </div>
        
        <div className="help-modal-body">
          <div className="help-section">
            <span className="help-number">01</span>
            <div><h4>Lose your hand</h4><p>Be the first player to put down every card. Lower cumulative score wins across seven rounds.</p></div>
          </div>

          <div className="help-section">
            <span className="help-number">02</span>
            <div><h4>Build from seven</h4><p>The 7♥ opens the table. Continue each suit outward in order: 6 ← 7 → 8, then 5 and 9, and so on.</p></div>
          </div>

          <div className="help-section">
            <span className="help-number">03</span>
            <div><h4>Play what glows</h4><p>On your turn, playable cards lift and glow. If nothing is available, pass. After 20 seconds, the game keeps things moving for you.</p></div>
          </div>

          <div className="help-section">
            <span className="help-number">04</span>
            <div><h4>Read the table</h4><p>Amber players have three cards or fewer. Red players can immediately play everything they have—stop them if you can.</p></div>
          </div>
        </div>
        <button className="primary-button full-button" onClick={onClose}>Got it</button>
      </section>
    </div>
  );
};

export default HelpModal;
