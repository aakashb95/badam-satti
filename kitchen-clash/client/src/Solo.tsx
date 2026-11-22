import { useEffect, useRef, useState } from 'react';
import KitchenCard from './KitchenCard';
import type { PictureSize } from './layout';
import { createDeck, shuffled } from './deck';
import { ITEMS } from './items';
import { HOW_TO, HowToSteps } from './howto';
import { advance, clockFraction, DAILY_CARDS, isBetter, RULES, runTimeLeft, SOLO_CARDS, startRun, tap, todayKey, type SoloMode, type SoloResult, type SoloRun } from './solo';
import { playFinish, playWin, playWrong } from './sounds';
import type { Card } from './types';

// The solo games, played entirely on this phone. The rules are in solo.ts.
// Each game opens on a short how-to with a Start button; the countdown runs
// after that.
const COUNTDOWN_MS = 3_000;
const BEST_KEYS: Record<SoloMode, string> = {
  classic: 'kitchen-clash-solo-run-best',
  'time-attack': 'kitchen-clash-time-attack-best',
  daily: 'kitchen-clash-daily',
};
// The clock turns red for its last seconds.
const CLOCK_LOW_MS = 5_000;

interface Props {
  mode: SoloMode;
  menu: React.ReactNode;
  // The size setting, which also grows the pictures.
  pictureSize: PictureSize;
  onExit: () => void;
}

interface Message { text: string; tone: 'good' | 'bad' | 'warn'; key: number; itemId?: number }
interface DailyResult extends SoloResult { day: string; wrong: number }

function readStored<T>(key: string): T | null {
  try {
    return JSON.parse(window.localStorage.getItem(key) || 'null');
  } catch {
    return null;
  }
}

function readBest(mode: SoloMode): SoloResult | null {
  const best = readStored<SoloResult>(BEST_KEYS[mode]);
  return best && Number.isFinite(best.matched) && Number.isFinite(best.totalMs) ? best : null;
}

function readToday(): DailyResult | null {
  const result = readStored<DailyResult>(BEST_KEYS.daily);
  return result && result.day === todayKey() ? result : null;
}

const clock = (ms: number) => `${Math.floor(ms / 60_000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;
const tenths = (ms: number) => `${(ms / 1000).toFixed(1)} s`;

function newDeck(mode: SoloMode): Card[] {
  return mode === 'daily' ? shuffled(createDeck(), `daily:${todayKey()}`) : shuffled(createDeck());
}

function dailyShareText(result: DailyResult) {
  const [year, month, day] = result.day.split('-').map(Number);
  const date = new Date(year, month - 1, day).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  return `Kitchen Clash · Daily Kitchen ${date} · ${result.matched}/${DAILY_CARDS} in ${tenths(result.totalMs)} · ${result.wrong} wrong 🍅\n${window.location.origin}/kitchen-clash/`;
}

export default function Solo({ mode, menu, onExit, pictureSize }: Props) {
  const rules = RULES[mode];
  const [deck, setDeck] = useState<Card[]>(() => newDeck(mode));
  const [today] = useState(() => (mode === 'daily' ? readToday() : null));
  const [startsAt, setStartsAt] = useState<number | null>(null);
  const [run, setRun] = useState<SoloRun | null>(null);
  const [shake, setShake] = useState(0);
  const [wrongItem, setWrongItem] = useState<number | null>(null);
  const [nudge, setNudge] = useState(0);
  const [message, setMessage] = useState<Message | null>(null);
  const [best, setBest] = useState(() => readBest(mode));
  const [newBest, setNewBest] = useState(false);
  const [shared, setShared] = useState(false);
  const [, setTick] = useState(0);
  const previousRef = useRef<SoloRun | null>(null);

  const finished = run?.phase === 'finished';
  useEffect(() => {
    if (finished || startsAt === null) return undefined;
    const timer = window.setInterval(() => {
      const now = performance.now();
      setRun((current) => (current ? advance(current, now) : now >= startsAt ? startRun(now, mode) : null));
      setTick((value) => value + 1);
    }, 100);
    return () => window.clearInterval(timer);
  }, [finished, startsAt, mode]);

  // Sounds and messages follow what the rules decided, never the tap itself.
  useEffect(() => {
    const previous = previousRef.current;
    previousRef.current = run;
    if (!run || !previous || run === previous) return;
    const key = performance.now();
    if (run.matched > previous.matched) {
      const itemId = deck[run.centre % deck.length].items.find((item) => deck[previous.centre % deck.length].items.includes(item));
      setMessage({ text: 'You got it!', tone: 'good', key, itemId });
      playWin();
      navigator.vibrate?.(30);
    } else if (run.wrong > previous.wrong) {
      setShake((value) => value + 1);
      setMessage({ text: mode === 'time-attack' ? 'Not that one. −3 seconds' : 'Not that one. Wait a moment…', tone: 'bad', key });
      playWrong();
      navigator.vibrate?.(80);
    } else if (run.missed > previous.missed) {
      setMessage({ text: 'Too slow! Here is the next card.', tone: 'warn', key });
      playWrong();
    }
    if (run.phase === 'finished' && previous.phase !== 'finished') {
      playFinish();
      const result = { matched: run.matched, totalMs: run.totalMs };
      if (mode === 'daily') {
        window.localStorage.setItem(BEST_KEYS.daily, JSON.stringify({ ...result, wrong: run.wrong, day: todayKey() }));
      } else if (isBetter(result, best)) {
        window.localStorage.setItem(BEST_KEYS[mode], JSON.stringify(result));
        setBest(result);
        // A first run has nothing to beat, so it is not called a new best.
        setNewBest(best !== null);
      }
    }
  }, [run, deck, best, mode]);

  useEffect(() => {
    if (!message) return undefined;
    const timer = window.setTimeout(() => setMessage(null), 1_400);
    return () => window.clearTimeout(timer);
  }, [message]);

  const now = performance.now();
  const cardAt = (place: number) => deck[place % deck.length];

  const pick = (itemId: number) => {
    setWrongItem(itemId);
    setRun((current) => current && tap(current, cardAt(current.centre).items.includes(itemId), performance.now()));
  };

  // A tap on the middle card never counts; your card answers instead.
  const tapAside = () => setNudge((value) => value + 1);

  const begin = () => setStartsAt(performance.now() + COUNTDOWN_MS);

  const again = () => {
    setDeck(newDeck(mode));
    setRun(null);
    previousRef.current = null;
    setMessage(null);
    setNewBest(false);
    begin();
  };

  const share = async (result: DailyResult) => {
    const text = dailyShareText(result);
    try {
      if (navigator.share) await navigator.share({ text });
      else {
        await navigator.clipboard.writeText(text);
        setShared(true);
        window.setTimeout(() => setShared(false), 2_000);
      }
    } catch { /* The player closed the share sheet. */ }
  };

  const howTo = HOW_TO[mode];

  // Daily Kitchen, already played today: show today's result instead.
  const dailyDone = mode === 'daily' && (today || run?.phase === 'finished') ? (today || readToday()) : null;

  if (dailyDone) {
    return (
      <main className="screen results">
        <section className="panel solo-results">
          <p className="eyebrow">{howTo.emoji} {howTo.name}</p>
          <h1 className="results-title">{run?.phase === 'finished' ? 'Done for today!' : 'You played today'}</h1>
          <p className="solo-score" aria-label={`${dailyDone.matched} of ${DAILY_CARDS} in ${tenths(dailyDone.totalMs)}`}><strong>{tenths(dailyDone.totalMs)}</strong>{dailyDone.matched} of {DAILY_CARDS} cards</p>
          <dl className="solo-stats">
            <div><dt>Wrong taps</dt><dd>{dailyDone.wrong}</dd></div>
            <div><dt>Average per card</dt><dd>{dailyDone.matched ? tenths(dailyDone.totalMs / dailyDone.matched) : '–'}</dd></div>
          </dl>
          <p className="hint">New cards tomorrow. Everyone gets the same ones, so compare times with friends.</p>
          <button type="button" className="primary big" onClick={() => share(dailyDone)}>{shared ? 'Copied ✓' : '📤 Share my time'}</button>
          <button type="button" className="secondary" onClick={onExit}>Back to start</button>
        </section>
      </main>
    );
  }

  if (run?.phase === 'finished') {
    const timeAttack = mode === 'time-attack';
    return (
      <main className="screen results">
        <section className="panel solo-results">
          <p className="eyebrow">{howTo.emoji} {howTo.name}</p>
          <h1 className="results-title">{newBest ? 'New best! 🏆' : timeAttack ? 'Time’s up!' : 'All done!'}</h1>
          {timeAttack
            ? <p className="solo-score" aria-label={`${run.matched} matched in 60 seconds`}><strong>{run.matched}</strong>matched in 60 seconds</p>
            : <p className="solo-score" aria-label={`${run.matched} of ${SOLO_CARDS} matched`}><strong>{run.matched}<span> / {SOLO_CARDS}</span></strong> matched</p>}
          <dl className="solo-stats">
            {!timeAttack && <div><dt>Missed</dt><dd>{run.missed}</dd></div>}
            <div><dt>Wrong taps</dt><dd>{run.wrong}</dd></div>
            {timeAttack ? <div><dt>Time lost</dt><dd>{Math.round(run.penaltyMs / 1000)} s</dd></div> : <div><dt>Total time</dt><dd>{clock(run.totalMs)}</dd></div>}
            <div><dt>Average per match</dt><dd>{run.matched ? tenths(run.matchMs / run.matched) : '–'}</dd></div>
          </dl>
          {best && <p className="hint">Your best: {timeAttack ? `${best.matched} matched` : `${best.matched} of ${SOLO_CARDS} in ${clock(best.totalMs)}`}</p>}
          <button type="button" className="primary big" onClick={again}>Play again</button>
          <button type="button" className="secondary" onClick={onExit}>Back to start</button>
        </section>
      </main>
    );
  }

  // Before the run: what this game is and how to play it.
  if (startsAt === null) {
    return (
      <main className="screen lobby">
        <header className="top-bar"><span className="brand">Kitchen <em>Clash</em></span>{menu}</header>
        <section className="panel mode-intro">
          <p className="mode-intro-emoji" aria-hidden="true">{howTo.emoji}</p>
          <h1>{howTo.name}</h1>
          <p className="tagline">{howTo.tagline}</p>
          <HowToSteps mode={mode} />
          {best && mode !== 'daily' && <p className="hint">Your best: {mode === 'time-attack' ? `${best.matched} matched` : `${best.matched} of ${SOLO_CARDS} in ${clock(best.totalMs)}`}</p>}
          <div className="mode-intro-actions">
            <button type="button" className="primary big" onClick={begin}>Start</button>
            <button type="button" className="secondary" onClick={onExit}>Back</button>
          </div>
        </section>
      </main>
    );
  }

  const countdown = run ? null : Math.max(1, Math.ceil((startsAt - now) / 1000));
  const fraction = run ? clockFraction(run, now) : 1;
  const msLeft = !run ? Infinity : rules.runMs !== null ? runTimeLeft(run, now) : rules.cardMs !== null ? fraction * rules.cardMs : Infinity;
  const locked = Boolean(run && run.phase === 'playing' && run.lockedUntil > now);
  const missed = run?.phase === 'missed';
  const cardsLeft = run ? (Number.isFinite(rules.cards) ? rules.cards - run.card + 1 : undefined) : undefined;
  const elapsed = run ? now - run.runStartedAt : 0;

  return (
    <main className="screen table solo">
      <header className="table-header">
        {mode === 'daily' ? (
          <div className="card-clock stopwatch" role="timer" aria-label={`${Math.floor(elapsed / 1000)} seconds`}>
            <span aria-hidden="true">🗓️</span><span className="stopwatch-time">{tenths(elapsed)}</span>
          </div>
        ) : (
          <div className={`card-clock${msLeft <= CLOCK_LOW_MS ? ' low' : ''}`} role="timer" aria-label={mode === 'time-attack' ? `${Math.ceil(msLeft / 1000)} seconds left` : `${Math.ceil(msLeft / 1000)} seconds left for this card`}>
            <span aria-hidden="true">{mode === 'time-attack' ? '⚡' : '⏱'}</span>
            <div className="card-clock-track"><div className="card-clock-fill" style={{ width: `${fraction * 100}%` }} /></div>
            <span className="clock-seconds" aria-hidden="true">{Number.isFinite(msLeft) ? Math.ceil(msLeft / 1000) : ''}</span>
          </div>
        )}
        {mode === 'classic'
          ? <div className="solo-score-chip" aria-label={`Card ${run?.card ?? 1} of ${SOLO_CARDS}`}>{run?.card ?? 1}<span className="chip-of">/{SOLO_CARDS}</span></div>
          : <div className="solo-score-chip" aria-label={`${run?.matched ?? 0} matched`}>✅ {run?.matched ?? 0}</div>}
        {menu}
      </header>

      <section className="card-slot centre-slot" aria-label="Middle card">
        {run && <div key={run.centre} className={`arrive arrive-${run.centre ? 'from-you' : 'fresh'}`}><KitchenCard card={cardAt(run.centre)} seed={`solo-centre:${run.centre}`} label="Middle card" onTapAside={tapAside} pictureSize={pictureSize} /></div>}
      </section>

      <p className={`table-message tone-${message?.tone || 'info'}`} role="status" aria-live="polite" key={message?.key}>
        {message?.itemId !== undefined && <span className="message-item" role="img" aria-label={ITEMS[message.itemId].name}>{ITEMS[message.itemId].emoji}</span>}
        <span>{message?.text || 'Find the picture on both cards. Tap it on yours.'}</span>
      </p>

      <section className="card-slot your-slot" aria-label="Your card">
        {run && (
          <div key={run.card} className={`hand${missed ? ' is-missed' : ''}`}>
            <KitchenCard card={cardAt(run.card)} seed={`solo-you:${run.card}`} label="Your card" onPick={pick} disabled={locked || missed} shake={locked ? shake : 0} nudge={nudge} pile={cardsLeft} wrongItemId={locked ? wrongItem : null} lockFraction={locked ? Math.min(1, (run.lockedUntil - now) / rules.lockoutMs) : 0} pictureSize={pictureSize} />
          </div>
        )}
      </section>

      {countdown !== null && (
        <div className="countdown" role="status" aria-live="assertive">
          <p>{howTo.emoji} {howTo.name}</p>
          <span key={countdown}>{countdown}</span>
        </div>
      )}
    </main>
  );
}
