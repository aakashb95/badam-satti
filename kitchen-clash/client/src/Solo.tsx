import { useEffect, useRef, useState } from 'react';
import KitchenCard from './KitchenCard';
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
  const [index, setIndex] = useState(1);
  const [phase, setPhase] = useState<Phase>('countdown');
  const [phaseEndsAt, setPhaseEndsAt] = useState(() => performance.now() + COUNTDOWN_MS);
  const [score, setScore] = useState(0);
  const [misses, setMisses] = useState(0);
  const [lockedUntil, setLockedUntil] = useState(0);
  const [shake, setShake] = useState(0);
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
      playWrong();
      navigator.vibrate?.(80);
    }
  };

  const tapAside = () => {
    if (phase !== 'playing') return;
    setMessage({ text: '👇 Tap the matching picture on YOUR card', tone: 'info', key: performance.now() });
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
          <p className="results-title">{newBest ? 'New best! 🏆' : 'Time’s up!'}</p>
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

      <section className="card-slot centre-slot" aria-label="Middle card">
        <KitchenCard card={centre} seed={`solo-centre:${index}`} label="Middle card" onTapAside={tapAside} />
        <p className="slot-label"><span aria-hidden="true">👀</span> Middle card · look here</p>
      </section>

      <p className={`table-message tone-${locked ? 'bad' : message?.tone || 'info'}`} role="status" aria-live="polite" key={message?.key}>
        {locked ? `Not that one. Wait ${((lockedUntil - now) / 1000).toFixed(1)} s…` : message?.text || 'Tap the picture that is on both cards.'}
      </p>

      <section className="card-slot your-slot" aria-label="Your card">
        <KitchenCard card={mine} seed={`solo-you:${index}`} label="Your card" onPick={pick} disabled={locked || phase !== 'playing'} shake={shake} nudge={nudge} />
        <p className="slot-label your-label"><span aria-hidden="true">👆</span> Tap your card</p>
      </section>

      {phase === 'countdown' && (
        <div className="countdown" role="status" aria-live="assertive">
          <p>Match as many as you can in {SOLO_SECONDS} seconds</p>
          <span key={secondsLeft}>{Math.max(1, secondsLeft)}</span>
        </div>
      )}
    </main>
  );
}
