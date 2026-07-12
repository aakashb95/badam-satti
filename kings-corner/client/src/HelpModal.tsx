import { useEffect, useState } from 'react';
import type { ComfortSize } from './types';
import GameDeskLink from './GameDeskLink';

interface Props { open: boolean; onClose: () => void; comfortSize: ComfortSize; onComfortSizeChange: (size: ComfortSize) => void; onReturnToGameDesk?: () => Promise<void> }
type Visual = 'deal' | 'king' | 'build' | 'move' | 'finish' | 'hint' | 'timer';
const LESSONS: Array<{ section: 'Game rules' | 'Using the table'; eyebrow: string; title: string; copy: string; visual: Visual }> = [
  { section: 'Game rules', eyebrow: 'Start your turn', title: 'A card is drawn for you', copy: 'Everyone begins with seven cards. At the start of each turn, the stock deals you one more.', visual: 'deal' },
  { section: 'Game rules', eyebrow: 'The four corners', title: 'Only Kings open a corner', copy: 'Draw a King and it moves there automatically. Then you draw a replacement card.', visual: 'king' },
  { section: 'Game rules', eyebrow: 'Build the piles', title: 'Go down. Alternate colours.', copy: 'A black Jack fits on a red Queen; a red Ten fits on that Jack. Suits do not matter — only rank and colour.', visual: 'build' },
  { section: 'Game rules', eyebrow: 'Make space', title: 'Move a whole pile together', copy: 'If its bottom card fits another pile, move the complete sequence as one.', visual: 'move' },
  { section: 'Game rules', eyebrow: 'One turn, many moves', title: 'Play all you can, then finish', copy: 'You may make several useful moves. Empty your hand first to win the table.', visual: 'finish' },
  { section: 'Using the table', eyebrow: 'Helpful, not restrictive', title: 'Follow the arrow — or choose', copy: 'The arrow suggests one strong move. Every other glowing card and pile is still playable.', visual: 'hint' },
  { section: 'Using the table', eyebrow: 'End your turn', title: 'Use Finish turn when you’re done', copy: 'The timer is at the top. After 20 seconds, the table makes one helpful move for you.', visual: 'timer' },
];

const Card = ({ rank, suit, className = '' }: { rank: string; suit: string; className?: string }) => <span className={`kc-lesson-card ${suit === '♥' || suit === '♦' ? 'red' : ''} ${className}`}><b>{rank}</b><i>{suit}</i></span>;

function VisualStage({ visual }: { visual: Visual }) {
  return <div className={`kc-lesson-stage kc-${visual}`} aria-hidden="true">
    {visual === 'deal' && <><div className="kc-stock">K</div><div className="kc-hand"><Card rank="4" suit="♠" /><Card rank="9" suit="♥" /><Card rank="A" suit="♣" /></div><Card rank="6" suit="♦" className="kc-drawn" /><span className="kc-caption">Drawn automatically</span></>}
    {visual === 'king' && <><div className="kc-quarter-board"><span className="kc-quarter-line horizontal" /><span className="kc-quarter-line vertical" /><div className="kc-quarter-corner"><small>KING CORNER</small><span>K</span></div><div className="kc-quarter-stock"><small>STOCK</small><b>K</b></div><div className="kc-quarter-main"><small>BOARD PILE</small><Card rank="5" suit="♥" /></div><Card rank="K" suit="♠" className="kc-moving-king" /></div><span className="kc-caption">A drawn King locks into the corner</span></>}
    {visual === 'build' && <><Card rank="Q" suit="♥" className="kc-stack-q" /><Card rank="J" suit="♣" className="kc-stack-j" /><Card rank="10" suit="♦" className="kc-stack-ten" /><span className="kc-caption">Q♥ → J♣ → 10♦</span></>}
    {visual === 'move' && <><div className="kc-pile-source"><Card rank="J" suit="♣" /><Card rank="10" suit="♦" /></div><div className="kc-pile-target"><Card rank="Q" suit="♥" /></div><span className="kc-move-arrow">→</span><span className="kc-caption">Move the full sequence</span></>}
    {visual === 'finish' && <><div className="kc-hand kc-clearing-hand"><Card rank="K" suit="♦" /><Card rank="8" suit="♠" /><Card rank="3" suit="♥" /></div><button type="button" tabIndex={-1}>Finish turn →</button><span className="kc-win">Hand clear ✓</span></>}
    {visual === 'hint' && <><div className="kc-mini-board"><Card rank="Q" suit="♥" /><Card rank="9" suit="♣" /></div><div className="kc-hand"><Card rank="J" suit="♠" className="playable" /><Card rank="8" suit="♦" className="playable alternate" /><Card rank="4" suit="♣" /></div><span className="kc-hint-arrow">↑ best move</span><span className="kc-caption">Glowing cards are tappable</span></>}
    {visual === 'timer' && <><div className="kc-ui-top"><span>?</span><b>YOUR TURN</b><i>20</i></div><div className="kc-mini-board"><Card rank="Q" suit="♥" /><Card rank="J" suit="♣" /></div><button type="button" tabIndex={-1}>Finish turn →</button><span className="kc-auto-note">Automatic move</span></>}
  </div>;
}

export default function HelpModal({ open, onClose, comfortSize, onComfortSizeChange, onReturnToGameDesk }: Props) {
  const [step, setStep] = useState(0);
  useEffect(() => { if (open) setStep(0); }, [open]);
  if (!open) return null;
  const lesson = LESSONS[step];
  const last = step === LESSONS.length - 1;

  return <div className="help-overlay" onClick={onClose} role="presentation">
    <section className="help-dialog walkthrough-dialog" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="help-title">
      <div className="walkthrough-topline"><GameDeskLink onBeforeNavigate={onReturnToGameDesk} className="help-game-desk" /><button onClick={onClose} aria-label="Close help">×</button></div>
      <header className="walkthrough-header"><div><p className="eyebrow">King’s Corner · 2 minute guide</p><h2 id="help-title">How to play</h2></div><span>{step + 1} / {LESSONS.length}</span></header>
      <nav className="walkthrough-sections" aria-label="Tutorial sections"><span className={lesson.section === 'Game rules' ? 'active' : ''}>Game rules</span><span className={lesson.section === 'Using the table' ? 'active' : ''}>Using the table</span></nav>
      <div className="walkthrough-progress" aria-hidden="true">{LESSONS.map((_, index) => <i key={index} className={index <= step ? 'active' : ''} />)}</div>
      <VisualStage key={step} visual={lesson.visual} />
      <div className="walkthrough-copy" aria-live="polite"><p className="eyebrow">{lesson.eyebrow}</p><h3>{lesson.title}</h3><p>{lesson.copy}</p></div>
      {last && <div className="walkthrough-size"><span>Text size</span><div role="group" aria-label="Text size">{(['standard', 'large', 'extra-large', 'maximum'] as ComfortSize[]).map((size, index) => <button key={size} className={comfortSize === size ? 'active' : ''} onClick={() => onComfortSizeChange(size)} aria-pressed={comfortSize === size}>A{index ? '+'.repeat(index) : ''}</button>)}</div></div>}
      <div className="walkthrough-actions"><button className="walkthrough-back" onClick={() => setStep((value) => Math.max(0, value - 1))} disabled={step === 0}>Back</button><button className="help-done walkthrough-next" onClick={last ? onClose : () => setStep((value) => value + 1)}>{last ? 'Got it — let’s play' : 'Next'} <span aria-hidden="true">→</span></button></div>
    </section>
  </div>;
}
