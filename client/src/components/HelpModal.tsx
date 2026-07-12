import React, { useEffect, useState } from 'react';
import { ComfortSize } from '../types';
import GameDeskLink from './GameDeskLink';

interface HelpModalProps {
  isOpen: boolean;
  onClose: () => void;
  comfortSize: ComfortSize;
  onComfortSizeChange: (size: ComfortSize) => void;
  onReturnToGameDesk?: () => Promise<void>;
}

type Lesson = {
  section: 'Game rules' | 'Using the table';
  eyebrow: string;
  title: string;
  copy: string;
  visual: 'goal' | 'start' | 'build' | 'turn' | 'score' | 'ui';
};

const LESSONS: Lesson[] = [
  { section: 'Game rules', eyebrow: 'The goal', title: 'Empty your hand first', copy: 'Play every card before everyone else to win the round.', visual: 'goal' },
  { section: 'Game rules', eyebrow: 'Opening move', title: 'The 7♥ starts the table', copy: 'It is played automatically. The other sevens can start their own suit rows.', visual: 'start' },
  { section: 'Game rules', eyebrow: 'Build each suit', title: 'Higher above. Lower below.', copy: 'Only the next card in the same suit fits: 8 above 7, or 6 below 7.', visual: 'build' },
  { section: 'Game rules', eyebrow: 'Your turn', title: 'Play one card — or pass', copy: 'If nothing fits, pass. If you wait, the table makes a move after 20 seconds.', visual: 'turn' },
  { section: 'Game rules', eyebrow: 'Seven rounds', title: 'Keep the lowest score', copy: 'Cards left in your hand add their face value. Lowest total after seven rounds wins.', visual: 'score' },
  { section: 'Using the table', eyebrow: 'Your first turn', title: 'Look for the lifted card', copy: 'Your timer is at the top. Playable cards lift and glow in your hand — just tap one.', visual: 'ui' },
];

const MiniCard = ({ rank, suit, className = '' }: { rank: string; suit: string; className?: string }) => (
  <span className={`lesson-card ${suit === '♥' || suit === '♦' ? 'is-red' : ''} ${className}`}><b>{rank}</b><i>{suit}</i></span>
);

function LessonVisual({ visual }: { visual: Lesson['visual'] }) {
  return (
    <div className={`lesson-stage lesson-${visual}`} aria-hidden="true">
      {visual === 'goal' && <><div className="lesson-hand"><MiniCard rank="4" suit="♣" /><MiniCard rank="J" suit="♦" /><MiniCard rank="A" suit="♠" /></div><span className="lesson-win-badge">Hand clear ✓</span></>}
      {visual === 'start' && <><span className="lesson-board-label">TABLE</span><MiniCard rank="7" suit="♥" className="lesson-start-seven" /><div className="lesson-side-sevens"><MiniCard rank="7" suit="♦" /><MiniCard rank="7" suit="♣" /><MiniCard rank="7" suit="♠" /></div></>}
      {visual === 'build' && <><span className="lesson-target lesson-target-up">8</span><MiniCard rank="7" suit="♥" className="lesson-build-seven" /><span className="lesson-target lesson-target-down">6</span><MiniCard rank="8" suit="♥" className="lesson-build-eight" /><MiniCard rank="6" suit="♥" className="lesson-build-six" /></>}
      {visual === 'turn' && <><span className="lesson-clock">20</span><div className="lesson-hand lesson-turn-hand"><MiniCard rank="10" suit="♣" /><MiniCard rank="6" suit="♦" className="is-playable" /><MiniCard rank="Q" suit="♠" /></div><span className="lesson-tap">Tap</span><button type="button" tabIndex={-1}>Pass</button></>}
      {visual === 'score' && <><div className="lesson-score-row winner"><span>YOU</span><strong>8</strong></div><div className="lesson-score-row"><span>MAYA</span><strong>21</strong></div><div className="lesson-score-row"><span>DEV</span><strong>34</strong></div><span className="lesson-score-note">Lowest total wins</span></>}
      {visual === 'ui' && <><div className="lesson-ui-top"><span>7♥</span><b>YOUR TURN</b><i>14s</i></div><div className="lesson-ui-players"><span>ANU · 5</span><span>MAYA · 3</span></div><div className="lesson-ui-board"><MiniCard rank="7" suit="♥" /><MiniCard rank="8" suit="♥" /></div><div className="lesson-ui-hand"><MiniCard rank="6" suit="♥" className="is-playable" /><MiniCard rank="K" suit="♣" /><MiniCard rank="3" suit="♦" /></div><span className="lesson-ui-finger">↑ tap</span></>}
    </div>
  );
}

const HelpModal: React.FC<HelpModalProps> = ({ isOpen, onClose, comfortSize, onComfortSizeChange, onReturnToGameDesk }) => {
  const [step, setStep] = useState(0);

  useEffect(() => { if (isOpen) setStep(0); }, [isOpen]);
  if (!isOpen) return null;

  const lesson = LESSONS[step];
  const last = step === LESSONS.length - 1;

  return (
    <div className="help-modal-overlay" onClick={onClose} role="presentation">
      <section className="help-modal-content walkthrough-dialog" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="help-title">
        <div className="walkthrough-topline"><GameDeskLink onBeforeNavigate={onReturnToGameDesk} className="help-game-desk" /><button className="help-close-btn" onClick={onClose} aria-label="Close help">×</button></div>
        <header className="walkthrough-header">
          <div><span className="eyebrow">Badam 7 · 2 minute guide</span><h3 id="help-title">How to play</h3></div>
          <span className="walkthrough-count">{step + 1} / {LESSONS.length}</span>
        </header>

        <nav className="walkthrough-sections" aria-label="Tutorial sections">
          <span className={lesson.section === 'Game rules' ? 'active' : ''}>Game rules</span>
          <span className={lesson.section === 'Using the table' ? 'active' : ''}>Using the table</span>
        </nav>

        <div className="walkthrough-progress" aria-hidden="true">{LESSONS.map((_, index) => <i key={index} className={index <= step ? 'active' : ''} />)}</div>
        <LessonVisual key={step} visual={lesson.visual} />

        <div className="walkthrough-copy" aria-live="polite">
          <span className="eyebrow">{lesson.eyebrow}</span>
          <h4>{lesson.title}</h4>
          <p>{lesson.copy}</p>
        </div>

        {last && <div className="walkthrough-size"><span>Text size</span><div role="group" aria-label="Text size">{(['standard', 'large', 'extra-large', 'maximum'] as ComfortSize[]).map((size, index) => <button key={size} onClick={() => onComfortSizeChange(size)} className={comfortSize === size ? 'active' : ''} aria-pressed={comfortSize === size}>A{index ? '+'.repeat(index) : ''}</button>)}</div></div>}

        <div className="walkthrough-actions">
          <button className="walkthrough-back" onClick={() => setStep((value) => Math.max(0, value - 1))} disabled={step === 0}>Back</button>
          <button className="primary-button walkthrough-next" onClick={last ? onClose : () => setStep((value) => value + 1)}>{last ? 'Got it — let’s play' : 'Next'} <span aria-hidden="true">→</span></button>
        </div>
      </section>
    </div>
  );
};

export default HelpModal;
