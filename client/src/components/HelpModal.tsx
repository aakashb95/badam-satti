import React from 'react';
import { ComfortSize } from '../types';
import GameDeskLink from './GameDeskLink';

interface HelpModalProps {
  isOpen: boolean;
  onClose: () => void;
  comfortSize: ComfortSize;
  onComfortSizeChange: (size: ComfortSize) => void;
  onReturnToGameDesk?: () => Promise<void>;
}

const COMFORT_SIZES: ComfortSize[] = ['standard', 'large', 'extra-large'];

const COMFORT_LABELS: Record<ComfortSize, string> = {
  standard: 'Standard',
  large: 'Large',
  'extra-large': 'Extra large',
};

const HelpModal: React.FC<HelpModalProps> = ({ isOpen, onClose, comfortSize, onComfortSizeChange, onReturnToGameDesk }) => {
  if (!isOpen) return null;

  const currentIndex = COMFORT_SIZES.indexOf(comfortSize);
  const sliderValue = currentIndex === -1 ? 0 : currentIndex;

  return (
    <div className="help-modal-overlay" onClick={onClose} role="presentation">
      <section className="help-modal-content" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="help-title">
        <GameDeskLink onBeforeNavigate={onReturnToGameDesk} className="help-game-desk" />
        <div className="help-modal-header">
          <div><span className="eyebrow">Tiny guide</span><h3 id="help-title">How to play</h3></div>
          <button className="help-close-btn" onClick={onClose} aria-label="Close help">×</button>
        </div>

        <div className="help-demo" aria-label="Cards are placed above and below seven">
          <div className="help-demo-board" aria-hidden="true">
            <span className="demo-side-seven demo-diamond">7<span>♦</span></span>
            <span className="demo-side-seven demo-club">7<span>♣</span></span>
            <span className="demo-side-seven demo-spade">7<span>♠</span></span>
            <span className="demo-slot demo-up-target">8</span>
            <span className="demo-card demo-seven">7<span>♥</span></span>
            <span className="demo-slot demo-down-target">6</span>
            <span className="demo-card demo-moving-card demo-moving-eight">8<span>♥</span></span>
            <span className="demo-card demo-moving-card demo-moving-six">6<span>♥</span></span>
          </div>
          <p>8 goes above 7. 6 goes below. Any 7 starts a side pile.</p>
        </div>

        <div className="comfort-control" aria-label="Display size">
          <div className="comfort-copy">
            <label htmlFor="comfort-size">Comfort size</label>
            <span>{COMFORT_LABELS[comfortSize]}</span>
          </div>
          <input
            id="comfort-size"
            type="range"
            min="0"
            max="2"
            step="1"
            value={sliderValue}
            onChange={(event) => onComfortSizeChange(COMFORT_SIZES[Number(event.target.value)] || 'standard')}
            aria-valuetext={COMFORT_LABELS[comfortSize]}
          />
          <div className="comfort-scale-labels" aria-hidden="true">
            <span>A</span>
            <span>A</span>
            <span>A</span>
          </div>
        </div>
        
        <div className="help-modal-body">
          <div className="help-section">
            <span className="help-number">01</span>
            <div><h4>Get rid of your cards</h4><p>First player with no cards wins the round.</p></div>
          </div>

          <div className="help-section">
            <span className="help-number">02</span>
            <div><h4>Tap the glowing card</h4><p>If a card lifts up, you can play it. No move? Pass.</p></div>
          </div>

          <div className="help-section">
            <span className="help-number">03</span>
            <div><h4>Lowest score wins</h4><p>Cards left in your hand add points. Keep that number small.</p></div>
          </div>
        </div>
        <button className="primary-button full-button" onClick={onClose}>Okay, let’s play</button>
      </section>
    </div>
  );
};

export default HelpModal;
