import { useEffect, useRef, useState } from 'react';
import KitchenCard from './KitchenCard';
import { useCornerLabel } from './useCornerLabel';
import { createDeck, shuffled } from './deck';
import { playFinish, playWin, playWrong } from './sounds';
import type { Card } from './types';

// Single-player mode, played entirely on this phone: match as many cards as
// you can in 30 seconds. A wrong tap costs the same 1.5 s as in a race.
export const SOLO_SECONDS = 30;
const LOCKOUT_MS = 1_500;
const COUNTDOWN_MS = 3_000;
const BEST_KEY = 'kitchen-clash-solo-best';

type Phase = 'countdown' | 'playing' | 'finished';

interface Props {
  menu: React.ReactNode;
  onExit: () => void;
}

export default function Solo({ menu, onExit }: Props) {
  const [deck, setDeck] = useState<Card[]>(() => shuffled(createDeck()));
  const centreSlot = useCornerLabel();
  const [index, setIndex] = useState(1);
  const [phase, setPhase] = useState<Phase>('countdown');
  const [phaseEndsAt, setPhaseEndsAt] = useState(() => performance.now() + COUNTDOWN_MS);
  const [score, setScore] = useState(0);
  const [misses, setMisses] = useState(0);
  const [lockedUntil, setLockedUntil] = useState(0);
  const [shake, setShake] = useState(0);
  const [wrongItem, setWrongItem] = useState<number | null>(null);
  const [nudge, setNudge] = useState(0);
  const [message, setMessage] = useState<{ text: string; tone: 'good' | 'bad' | 'info'; key: number } | null>(null);
  const [best, setBest] = useState(() => Number(window.localStorage.getItem(BEST_KEY)) || 0);
  const [newBest, setNewBest] = useState(false);
  const [, setTick] = useState(0);
  const scoreRef = useRef(0);

  useEffect(() => {
    if (phase === 'finished') return undefined;
    const timer = window.setInterval(() => setTick((value) => value + 1), 100);
    return () => window.clearInterval(timer);
  }, [phase]);

  const now = performance.now();
  useEffect(() => {
    if (phase === 'countdown' && now >= phaseEndsAt) {
      setPhase('playing');
      setPhaseEndsAt(performance.now() + SOLO_SECONDS * 1000);
    } else if (phase === 'playing' && now >= phaseEndsAt) {
      setPhase('finished');
      playFinish();
      const final = scoreRef.current;
      if (final > best) {
        window.localStorage.setItem(BEST_KEY, String(final));
        setBest(final);
        setNewBest(true);
      }
    }
  });

  useEffect(() => {
    if (!message) return undefined;
    const timer = window.setTimeout(() => setMessage(null), 1_400);
    return () => window.clearTimeout(timer);
  }, [message]);

  const centre = deck[index - 1];
  const mine = deck[index % deck.length];
  const locked = lockedUntil > now;

  const pick = (itemId: number) => {
    if (phase !== 'playing' || performance.now() < lockedUntil) return;
    if (mine.items.includes(itemId) && centre.items.includes(itemId)) {
      scoreRef.current += 1;
      setScore(scoreRef.current);
      playWin();
      setMessage({ text: 'Yes! 🎉', tone: 'good', key: performance.now() });
      // Every pair of cards matches, so after the deck runs out a reshuffle
      // simply carries on.
      if (index + 1 >= deck.length) {
        setDeck(shuffled(createDeck()));
        setIndex(1);
      } else setIndex(index + 1);
    } else {
      setMisses((value) => value + 1);
      setLockedUntil(performance.now() + LOCKOUT_MS);
      setShake((value) => value + 1);
      setWrongItem(itemId);
      setMessage({ text: 'Not that one. Wait a moment…', tone: 'bad', key: performance.now() });
      playWrong();
      navigator.vibrate?.(80);
    }
  };

  const tapAside = () => {
    if (phase !== 'playing') return;
    setMessage({ text: 'Not this card. Tap the match on YOUR card.', tone: 'info', key: performance.now() });
    setNudge((value) => value + 1);
  };

  const again = () => {
    setDeck(shuffled(createDeck()));
    setIndex(1);
    scoreRef.current = 0;
    setScore(0);
    setMisses(0);
    setLockedUntil(0);
    setNewBest(false);
    setPhase('countdown');
    setPhaseEndsAt(performance.now() + COUNTDOWN_MS);
  };

  if (phase === 'finished') {
    return (
      <main className="screen results">
        <section className="panel solo-results">
          <p className="eyebrow">Solo · {SOLO_SECONDS} seconds</p>
          <h1 className="results-title">{newBest ? 'New best! 🏆' : 'Time’s up!'}</h1>
          <p className="solo-score"><strong>{score}</strong> {score === 1 ? 'match' : 'matches'}</p>
          <p className="hint">{misses} wrong · Your best: {best}</p>
          <button type="button" className="primary big" onClick={again}>Play again</button>
          <button type="button" className="secondary" onClick={onExit}>Back to start</button>
        </section>
      </main>
    );
  }

  const secondsLeft = Math.max(0, Math.ceil((phaseEndsAt - now) / 1000));
  const timerLow = phase === 'playing' && secondsLeft <= 5;

  return (
    <main className="screen table solo">
      <header className="table-header">
        <div className={`solo-timer${timerLow ? ' low' : ''}`} role="timer" aria-label={`${secondsLeft} seconds left`}>
          <span aria-hidden="true">⏱</span> {phase === 'playing' ? secondsLeft : SOLO_SECONDS}s
        </div>
        <div className="solo-score-chip" aria-label={`${score} matches`}>✅ {score}</div>
        {menu}
      </header>

      <section ref={centreSlot.slotRef} className="card-slot centre-slot" aria-label="Middle card">
        <p className={centreSlot.labelClass} aria-label="Look here"><span aria-hidden="true">👀</span><span className="label-text" aria-hidden="true"> Look here</span></p>
        {phase === 'playing' && <div key={index} className="arrive arrive-from-you"><KitchenCard card={centre} seed={`solo-centre:${index}`} label="Middle card" onTapAside={tapAside} /></div>}
      </section>

      <p className={`table-message tone-${message?.tone || 'info'}`} role="status" aria-live="polite" key={message?.key}>
        <span>{message?.text || 'Find the picture on both cards. Tap it on yours.'}</span>
      </p>

      <section className="card-slot your-slot" aria-label="Your card">
        <p className="slot-label"><span aria-hidden="true">👆</span> Tap here</p>
        {phase === 'playing' && <KitchenCard card={mine} seed={`solo-you:${index}`} label="Your card" onPick={pick} disabled={locked} shake={shake} nudge={nudge} wrongItemId={locked ? wrongItem : null} lockFraction={locked ? Math.min(1, (lockedUntil - now) / LOCKOUT_MS) : 0} />}
      </section>

      {phase === 'countdown' && (
        <div className="countdown" role="status" aria-live="assertive">
          <p>Match as many as you can in {SOLO_SECONDS} seconds</p>
          <span key={secondsLeft}>{Math.max(1, secondsLeft)}</span>
          <p className="countdown-hint">Find the one picture that is on both cards, then tap it on <strong>your</strong> card.</p>
        </div>
      )}
    </main>
  );
}
