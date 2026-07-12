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
  visual: 'deal' | 'start' | 'options' | 'build' | 'score' | 'rounds' | 'ui';
};

const LESSONS: Lesson[] = [
  { section: 'Game rules', eyebrow: 'The deal', title: 'Every card is dealt', copy: 'All 52 cards are shared among the players. Some people may start with one extra card — that’s fine.', visual: 'deal' },
  { section: 'Game rules', eyebrow: 'Opening move', title: 'The 7♥ starts the table', copy: 'It is played automatically. The other sevens can start their own suit rows.', visual: 'start' },
  { section: 'Game rules', eyebrow: 'The next player', title: 'Three kinds of move can open', copy: 'Play another 7 to open a suit, or place the 8♥ above and the 6♥ below the starting card.', visual: 'options' },
  { section: 'Game rules', eyebrow: 'After that', title: 'Only the next card fits', copy: 'Build one step at a time in the same suit. Play exactly one card on your turn — or pass if nothing fits.', visual: 'build' },
  { section: 'Game rules', eyebrow: 'Round scoring', title: 'Get out first for zero points', copy: 'Everyone else adds the value of cards left in hand. High cards inflict more points; a higher score is worse.', visual: 'score' },
  { section: 'Game rules', eyebrow: 'The full game', title: 'Lowest total wins seven rounds', copy: 'Win quickly, hold up useful cards, and leave opponents with costly cards when you can.', visual: 'rounds' },
  { section: 'Using the table', eyebrow: 'Your first turn', title: 'Look for the lifted card', copy: 'Your timer is at the top. Playable cards lift and glow in your hand — just tap one.', visual: 'ui' },
];

const MiniCard = ({ rank, suit, className = '' }: { rank: string; suit: string; className?: string }) => (
  <span className={`lesson-card ${suit === '♥' || suit === '♦' ? 'is-red' : ''} ${className}`}><b>{rank}</b><i>{suit}</i></span>
);

function LessonVisual({ visual }: { visual: Lesson['visual'] }) {
  return (
    <div className={`lesson-stage lesson-${visual}`} aria-hidden="true">
      {visual === 'deal' && <><span className="lesson-deck">52</span><div className="lesson-deal-hands"><span><i>YOU</i><b>13</b></span><span><i>MAYA</i><b>13</b></span><span><i>DEV</i><b>13</b></span><span><i>ANU</i><b>13</b></span></div><span className="lesson-deal-note">Every card finds a hand</span></>}
      {visual === 'start' && <><span className="lesson-board-label">TABLE</span><MiniCard rank="7" suit="♥" className="lesson-start-seven" /><div className="lesson-side-sevens"><MiniCard rank="7" suit="♦" /><MiniCard rank="7" suit="♣" /><MiniCard rank="7" suit="♠" /></div></>}
      {visual === 'options' && <><MiniCard rank="7" suit="♥" className="lesson-option-seven" /><MiniCard rank="7" suit="♣" className="lesson-option-other" /><MiniCard rank="8" suit="♥" className="lesson-option-eight" /><MiniCard rank="6" suit="♥" className="lesson-option-six" /><span className="lesson-option-label">Any 7 &nbsp;or&nbsp; next to 7♥</span></>}
      {visual === 'build' && <><div className="lesson-built-run"><MiniCard rank="9" suit="♥" /><MiniCard rank="8" suit="♥" /><MiniCard rank="7" suit="♥" /><MiniCard rank="6" suit="♥" /></div><MiniCard rank="5" suit="♥" className="lesson-next-five" /><span className="lesson-one-card">One card per turn</span></>}
      {visual === 'score' && <><div className="lesson-score-row winner"><span>YOU · hand clear</span><strong>0</strong></div><div className="lesson-score-row"><span>MAYA · K + 8</span><strong>21</strong></div><div className="lesson-score-row"><span>DEV · Q + J + 6</span><strong>29</strong></div><span className="lesson-score-note">Higher points hurt more</span></>}
      {visual === 'rounds' && <><div className="lesson-round-track">{[1,2,3,4,5,6,7].map((round) => <i key={round}>{round}</i>)}</div><div className="lesson-total winner"><span>YOU</span><strong>34</strong></div><div className="lesson-total"><span>MAYA</span><strong>51</strong></div><span className="lesson-score-note">Lowest total wins</span></>}
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
