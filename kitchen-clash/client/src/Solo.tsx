import { useEffect, useRef, useState } from 'react';
import KitchenCard from './KitchenCard';
import { createDeck, shuffled } from './deck';
import { ITEMS } from './items';
import { advance, clockFraction, isBetter, LOCKOUT_MS, SOLO_CARD_SECONDS, SOLO_CARDS, startRun, tap, type SoloResult, type SoloRun } from './solo';
import { playFinish, playWin, playWrong } from './sounds';
import type { Card } from './types';

// Single-player mode, played entirely on this phone. The rules are in solo.ts.
const COUNTDOWN_MS = 3_000;
const BEST_KEY = 'kitchen-clash-solo-run-best';
// The card clock turns red for its last seconds.
const CLOCK_LOW = 5 / SOLO_CARD_SECONDS;

interface Props {
  menu: React.ReactNode;
  onExit: () => void;
}

interface Message { text: string; tone: 'good' | 'bad' | 'warn'; key: number; itemId?: number }

function readBest(): SoloResult | null {
  try {
    const best = JSON.parse(window.localStorage.getItem(BEST_KEY) || 'null');
    return best && Number.isFinite(best.matched) && Number.isFinite(best.totalMs) ? best : null;
  } catch {
    return null;
  }
}

const clock = (ms: number) => `${Math.floor(ms / 60_000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;

export default function Solo({ menu, onExit }: Props) {
  const [deck, setDeck] = useState<Card[]>(() => shuffled(createDeck()));
  const [startsAt, setStartsAt] = useState(() => performance.now() + COUNTDOWN_MS);
  const [run, setRun] = useState<SoloRun | null>(null);
  const [shake, setShake] = useState(0);
  const [wrongItem, setWrongItem] = useState<number | null>(null);
  const [nudge, setNudge] = useState(0);
  const [message, setMessage] = useState<Message | null>(null);
  const [best, setBest] = useState(readBest);
  const [newBest, setNewBest] = useState(false);
  const [, setTick] = useState(0);
  const previousRef = useRef<SoloRun | null>(null);

  const finished = run?.phase === 'finished';
  useEffect(() => {
    if (finished) return undefined;
    const timer = window.setInterval(() => {
      const now = performance.now();
      setRun((current) => (current ? advance(current, now) : now >= startsAt ? startRun(now) : null));
      setTick((value) => value + 1);
    }, 100);
    return () => window.clearInterval(timer);
  }, [finished, startsAt]);

  // Sounds and messages follow what the rules decided, never the tap itself.
  useEffect(() => {
    const previous = previousRef.current;
    previousRef.current = run;
    if (!run || !previous || run === previous) return;
    const key = performance.now();
    if (run.matched > previous.matched) {
      const itemId = deck[run.centre].items.find((item) => deck[previous.centre].items.includes(item));
      setMessage({ text: 'You got it!', tone: 'good', key, itemId });
      playWin();
      navigator.vibrate?.(30);
    } else if (run.wrong > previous.wrong) {
      setShake((value) => value + 1);
      setMessage({ text: 'Not that one. Wait a moment…', tone: 'bad', key });
      playWrong();
      navigator.vibrate?.(80);
    } else if (run.missed > previous.missed) {
      setMessage({ text: 'Too slow! Here is the next card.', tone: 'warn', key });
      playWrong();
    }
    if (run.phase === 'finished' && previous.phase !== 'finished') {
      playFinish();
      const result = { matched: run.matched, totalMs: run.totalMs };
      if (isBetter(result, best)) {
        window.localStorage.setItem(BEST_KEY, JSON.stringify(result));
        setBest(result);
        setNewBest(true);
      }
    }
  }, [run, deck, best]);

  useEffect(() => {
    if (!message) return undefined;
    const timer = window.setTimeout(() => setMessage(null), 1_400);
    return () => window.clearTimeout(timer);
  }, [message]);

  const now = performance.now();

  const pick = (itemId: number) => {
    setWrongItem(itemId);
    setRun((current) => current && tap(current, deck[current.centre].items.includes(itemId), performance.now()));
  };

  // A tap on the middle card never counts; your card answers instead.
  const tapAside = () => setNudge((value) => value + 1);

  const again = () => {
    setDeck(shuffled(createDeck()));
    setRun(null);
    previousRef.current = null;
    setMessage(null);
    setNewBest(false);
    setStartsAt(performance.now() + COUNTDOWN_MS);
  };

  if (run?.phase === 'finished') {
    return (
      <main className="screen results">
        <section className="panel solo-results">
          <p className="eyebrow">Solo · {SOLO_CARDS} cards</p>
          <h1 className="results-title">{newBest ? 'New best! 🏆' : 'All done!'}</h1>
          <p className="solo-score" aria-label={`${run.matched} of ${SOLO_CARDS} matched`}><strong>{run.matched}<span> / {SOLO_CARDS}</span></strong> matched</p>
          <dl className="solo-stats">
            <div><dt>Missed</dt><dd>{run.missed}</dd></div>
            <div><dt>Wrong taps</dt><dd>{run.wrong}</dd></div>
            <div><dt>Total time</dt><dd>{clock(run.totalMs)}</dd></div>
            <div><dt>Average per match</dt><dd>{run.matched ? `${(run.matchMs / run.matched / 1000).toFixed(1)} s` : '–'}</dd></div>
          </dl>
          {best && <p className="hint">Your best: {best.matched} of {SOLO_CARDS} in {clock(best.totalMs)}</p>}
          <button type="button" className="primary big" onClick={again}>Play again</button>
          <button type="button" className="secondary" onClick={onExit}>Back to start</button>
        </section>
      </main>
    );
  }

  const countdown = run ? null : Math.max(1, Math.ceil((startsAt - now) / 1000));
  const fraction = run ? clockFraction(run, now) : 1;
  const secondsLeft = Math.ceil(fraction * SOLO_CARD_SECONDS);
  const locked = Boolean(run && run.phase === 'playing' && run.lockedUntil > now);
  const missed = run?.phase === 'missed';

  return (
    <main className="screen table solo">
      <header className="table-header">
        <div className={`card-clock${fraction <= CLOCK_LOW ? ' low' : ''}`} role="timer" aria-label={`${secondsLeft} seconds left for this card`}>
          <span aria-hidden="true">⏱</span>
          <div className="card-clock-track"><div className="card-clock-fill" style={{ width: `${fraction * 100}%` }} /></div>
        </div>
        <div className="solo-score-chip" aria-label={`${run?.matched ?? 0} matched`}>✅ {run?.matched ?? 0}</div>
        {menu}
      </header>

      <section className="card-slot centre-slot" aria-label="Middle card">
        <div className="board" aria-hidden="true" />
        {run && <div key={run.centre} className={`arrive arrive-${run.centre ? 'from-you' : 'fresh'}`}><KitchenCard card={deck[run.centre]} seed={`solo-centre:${run.centre}`} label="Middle card" onTapAside={tapAside} /></div>}
      </section>

      <p className={`table-message tone-${message?.tone || 'info'}`} role="status" aria-live="polite" key={message?.key}>
        {message?.itemId !== undefined && <span className="message-item" role="img" aria-label={ITEMS[message.itemId].name}>{ITEMS[message.itemId].emoji}</span>}
        <span>{message?.text || 'Find the picture on both cards. Tap it on yours.'}</span>
      </p>

      <section className="card-slot your-slot" aria-label="Your card">
        {run && (
          <div key={run.card} className={`hand${missed ? ' is-missed' : ''}`}>
            <KitchenCard card={deck[run.card]} seed={`solo-you:${run.card}`} label="Your card" onPick={pick} disabled={locked || missed} shake={locked ? shake : 0} nudge={nudge} pile={SOLO_CARDS - run.card + 1} wrongItemId={locked ? wrongItem : null} lockFraction={locked ? Math.min(1, (run.lockedUntil - now) / LOCKOUT_MS) : 0} />
          </div>
        )}
      </section>

      {countdown !== null && (
        <div className="countdown" role="status" aria-live="assertive">
          <p>{SOLO_CARDS} cards · {SOLO_CARD_SECONDS} seconds each</p>
          <span key={countdown}>{countdown}</span>
          <p className="countdown-hint">Find the one picture that is on both cards, then tap it on <strong>your</strong> card.</p>
        </div>
      )}
    </main>
  );
}
