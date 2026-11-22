import { useCallback, useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { io, type Socket } from 'socket.io-client';
import KitchenCard from './KitchenCard';
import { isMusicOn, resumeMusicIfOn, setMusicOn } from './music';
import { isSoundOn, playFinish, playOtherWin, playWin, playWrong, setSoundOn, unlockAudio } from './sounds';
import type { ClaimResult, GameState, PlayerState } from './types';

const SESSION_KEY = 'kitchen-clash-session';
const NAME_KEY = 'kitchen-clash-name';
const TEXT_SIZE_KEY = 'kitchen-clash-text-size';
const TEXT_SIZES = ['normal', 'large', 'larger'] as const;
type TextSize = typeof TEXT_SIZES[number];
const TEXT_SIZE_LABELS: Record<TextSize, string> = { normal: 'A', large: 'A+', larger: 'A++' };
// Show the no-match countdown only near the end of a stuck round.
const ROUND_WARNING_MS = 15_000;
const AVATAR_COLOURS = ['#d9412b', '#2f8f5b', '#e0a100', '#2f6fb3', '#9b4fb0', '#c46a1b'];

type Tone = 'info' | 'good' | 'bad';
interface Message { text: string; tone: Tone; key: number }

const ordinal = (rank: number) => `${rank}${rank % 10 === 1 && rank !== 11 ? 'st' : rank % 10 === 2 && rank !== 12 ? 'nd' : rank % 10 === 3 && rank !== 13 ? 'rd' : 'th'}`;
const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`;

function inviteCodeFromPath() {
  const match = window.location.pathname.match(/\/kitchen-clash\/r\/([a-z0-9]{6})\/?$/i);
  return match?.[1]?.toUpperCase() || '';
}

function readSession(): { roomCode: string; sessionToken: string } | null {
  try {
    return JSON.parse(window.sessionStorage.getItem(SESSION_KEY) || 'null');
  } catch {
    return null;
  }
}

function useTick(active: boolean, intervalMs = 100) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!active) return undefined;
    const timer = window.setInterval(() => setTick((value) => value + 1), intervalMs);
    return () => window.clearInterval(timer);
  }, [active, intervalMs]);
}

function Avatar({ player, index }: { player: PlayerState; index: number }) {
  return <span className="avatar" style={{ background: AVATAR_COLOURS[index % AVATAR_COLOURS.length] }} aria-hidden="true">{player.name.slice(0, 1).toUpperCase()}</span>;
}

function HowToPlay() {
  return (
    <ol className="how-to">
      <li><span aria-hidden="true">👀</span><div><strong>Look at both cards.</strong> Exactly one picture is on your card and on the middle card.</div></li>
      <li><span aria-hidden="true">👆</span><div><strong>Tap that picture on your card.</strong> Be first and your card goes to the middle.</div></li>
      <li><span aria-hidden="true">⏳</span><div><strong>Wrong picture?</strong> You wait 1.5 seconds before you can tap again.</div></li>
      <li><span aria-hidden="true">🔄</span><div><strong>Turn your card</strong> by sliding a finger around it, or press ↻.</div></li>
      <li><span aria-hidden="true">🏆</span><div><strong>Run out of cards first</strong> to win. Everyone else plays on for the next places.</div></li>
    </ol>
  );
}

export default function App() {
  const socketRef = useRef<Socket | null>(null);
  const stateRef = useRef<GameState | null>(null);
  const shownAtRef = useRef(0);
  const pendingRoundRef = useRef<number | null>(null);
  const receivedAtRef = useRef(performance.now());
  const [state, setState] = useState<GameState | null>(null);
  const [connected, setConnected] = useState(false);
  const [hasSession, setHasSession] = useState(() => Boolean(readSession()));
  const [name, setName] = useState(() => window.localStorage.getItem(NAME_KEY) || '');
  const [code, setCode] = useState(inviteCodeFromPath);
  const [error, setError] = useState('');
  const [message, setMessage] = useState<Message | null>(null);
  const [lockedUntil, setLockedUntil] = useState(0);
  const [shake, setShake] = useState(0);
  const [showHelp, setShowHelp] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [copied, setCopied] = useState(false);
  const [soundOn, setSoundOnState] = useState(isSoundOn);
  const [musicOn, setMusicOnState] = useState(isMusicOn);
  const [textSize, setTextSize] = useState<TextSize>(() => {
    const stored = window.localStorage.getItem(TEXT_SIZE_KEY) as TextSize;
    return TEXT_SIZES.includes(stored) ? stored : 'normal';
  });

  const say = useCallback((text: string, tone: Tone) => setMessage({ text, tone, key: performance.now() }), []);

  useEffect(() => {
    document.documentElement.dataset.textSize = textSize;
    window.localStorage.setItem(TEXT_SIZE_KEY, textSize);
  }, [textSize]);

  useEffect(() => {
    const unlock = () => {
      unlockAudio();
      resumeMusicIfOn();
    };
    window.addEventListener('pointerdown', unlock);
    return () => window.removeEventListener('pointerdown', unlock);
  }, []);

  useEffect(() => {
    const socket = io({ path: '/kitchen-clash/socket.io', reconnectionDelay: 800, reconnectionDelayMax: 4_000 });
    socketRef.current = socket;
    socket.on('connect', () => {
      setConnected(true);
      const session = readSession();
      if (session) socket.emit('reconnect_room', session);
    });
    socket.on('disconnect', () => setConnected(false));
    socket.on('kc_ping', (acknowledge: () => void) => acknowledge());
    socket.on('session', (session: { roomCode: string; sessionToken: string; name: string }) => {
      window.sessionStorage.setItem(SESSION_KEY, JSON.stringify({ roomCode: session.roomCode, sessionToken: session.sessionToken }));
      setHasSession(true);
      setError('');
      if (window.location.pathname !== `/kitchen-clash/r/${session.roomCode}`) window.history.replaceState(null, '', `/kitchen-clash/r/${session.roomCode}`);
    });
    socket.on('session_invalid', () => {
      window.sessionStorage.removeItem(SESSION_KEY);
      setHasSession(false);
      setState(null);
      stateRef.current = null;
      setError('That game has ended or your seat expired. Start or join a new game.');
    });
    socket.on('error_message', (text: string) => setError(text));
    socket.on('state', (next: GameState) => {
      const previous = stateRef.current;
      receivedAtRef.current = performance.now();
      if (next.lastWin && next.lastWin.roundId !== previous?.lastWin?.roundId && previous?.phase === 'playing') {
        const mine = next.lastWin.name === next.you?.name;
        if (mine) {
          say('You got it! 🎉', 'good');
          playWin();
        } else {
          say(pendingRoundRef.current === next.lastWin.roundId ? `So close! ${next.lastWin.name} was faster.` : `${next.lastWin.name} got it.`, 'info');
          playOtherWin();
        }
        pendingRoundRef.current = null;
      }
      if (next.refreshedRoundId !== null && next.refreshedRoundId !== previous?.refreshedRoundId && previous?.phase === 'playing') {
        say('Nobody found it. Here is a new middle card!', 'info');
        pendingRoundRef.current = null;
      }
      if (next.phase === 'countdown' && previous?.phase !== 'countdown') {
        setMessage(null);
        setLockedUntil(0);
      }
      if (next.phase === 'finished' && previous?.phase !== 'finished') playFinish();
      if (next.you && next.you.lockoutMs > 0) setLockedUntil(performance.now() + next.you.lockoutMs);
      stateRef.current = next;
      setState(next);
    });
    return () => { socket.disconnect(); };
  }, [say]);

  // The reaction stopwatch starts when the new round is on screen. A hidden
  // tab gets no animation frames, so its stopwatch waits until it is seen.
  const roundKey = state?.phase === 'playing' ? `${state.roundId}:${state.you?.topCard?.id}` : '';
  useLayoutEffect(() => {
    if (!roundKey) return undefined;
    const frame = window.requestAnimationFrame(() => { shownAtRef.current = performance.now(); });
    return () => window.cancelAnimationFrame(frame);
  }, [roundKey]);

  const now = performance.now();
  const lockRemaining = Math.max(0, lockedUntil - now);
  const anyoneReconnecting = Boolean(state?.players.some((player) => player.reconnectMs !== null));
  useTick(lockRemaining > 0 || state?.phase === 'countdown', 100);
  const roundEndsIn = state?.phase === 'playing' && state.roundEndsInMs !== null ? state.roundEndsInMs - (now - receivedAtRef.current) : null;
  const roundEnding = roundEndsIn !== null && roundEndsIn <= ROUND_WARNING_MS;
  useTick(anyoneReconnecting || state?.phase === 'playing', 500);

  useEffect(() => {
    if (!message) return undefined;
    const timer = window.setTimeout(() => setMessage(null), 1_800);
    return () => window.clearTimeout(timer);
  }, [message]);

  const claim = (itemId: number) => {
    const socket = socketRef.current;
    const current = stateRef.current;
    if (!socket || !current || current.phase !== 'playing' || performance.now() < lockedUntil) return;
    // Never queue a tap for later: a tap made while offline is dropped.
    if (!socket.connected) return say('Reconnecting… that tap was not sent.', 'bad');
    const roundId = current.roundId;
    pendingRoundRef.current = roundId;
    socket.timeout(5_000).emit('claim', { roundId, itemId, reactionMs: Math.round(performance.now() - shownAtRef.current) }, (timeoutError: Error | null, reply: ClaimResult) => {
      if (timeoutError) {
        pendingRoundRef.current = null;
        return;
      }
      if (reply.result === 'wrong' || reply.result === 'locked') {
        pendingRoundRef.current = null;
        setLockedUntil(performance.now() + reply.lockoutMs);
        if (reply.result === 'wrong') {
          setShake((value) => value + 1);
          say('Not that one. Wait a moment…', 'bad');
          playWrong();
          navigator.vibrate?.(80);
        }
      } else if (reply.result === 'stale') {
        pendingRoundRef.current = null;
        const winner = stateRef.current?.lastWin?.name;
        say(winner ? `Too slow! ${winner} got it.` : 'Too slow!', 'info');
      }
    });
  };

  const start = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return setError('Please type your name first.');
    window.localStorage.setItem(NAME_KEY, trimmed);
    setError('');
    if (code.trim()) socketRef.current?.emit('join_room', { roomCode: code.trim(), name: trimmed });
    else socketRef.current?.emit('create_room', { name: trimmed });
  };

  const leave = () => {
    setConfirmLeave(false);
    const finish = () => {
      window.sessionStorage.removeItem(SESSION_KEY);
      setHasSession(false);
      setState(null);
      stateRef.current = null;
      setCode('');
      window.history.replaceState(null, '', '/kitchen-clash/');
    };
    const socket = socketRef.current;
    if (socket?.connected) socket.timeout(2_000).emit('leave_room', finish);
    else finish();
  };

  const share = async () => {
    if (!state) return;
    const url = `${window.location.origin}/kitchen-clash/r/${state.roomCode}`;
    try {
      if (navigator.share) await navigator.share({ title: 'Kitchen Clash', text: `Join my Kitchen Clash game. Room code ${state.roomCode}`, url });
      else {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2_000);
      }
    } catch { /* The player closed the share sheet. */ }
  };

  const toggleSound = () => { setSoundOn(!soundOn); setSoundOnState(!soundOn); };
  const toggleMusic = () => { setMusicOn(!musicOn); setMusicOnState(!musicOn); };

  const toolbar = (
    <div className="toolbar">
      <button type="button" className="tool-button" onClick={() => setTextSize(TEXT_SIZES[(TEXT_SIZES.indexOf(textSize) + 1) % TEXT_SIZES.length])} aria-label={`Text size ${textSize}. Tap to change.`}>{TEXT_SIZE_LABELS[textSize]}</button>
      <button type="button" className="tool-button" onClick={toggleSound} aria-label={soundOn ? 'Sound on. Tap to mute.' : 'Sound off. Tap to turn on.'}>{soundOn ? '🔊' : '🔇'}</button>
      <button type="button" className={`tool-button${musicOn ? '' : ' is-off'}`} onClick={toggleMusic} aria-label={musicOn ? 'Music on. Tap to stop.' : 'Music off. Tap to play.'}>🎵</button>
      <button type="button" className="tool-button" onClick={() => setShowHelp(true)} aria-label="How to play">?</button>
      {state && <button type="button" className="tool-button leave" onClick={() => setConfirmLeave(true)} aria-label="Leave game">✕</button>}
    </div>
  );

  const dialogs = (
    <>
      {showMenu && (
        <div className="dialog-backdrop" role="presentation" onClick={() => setShowMenu(false)}>
          <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="menu-title" onClick={(event) => event.stopPropagation()}>
            <h2 id="menu-title">Menu</h2>
            <div className="menu-row">
              <span>Text size</span>
              <div className="segmented" role="group" aria-label="Text size">
                {TEXT_SIZES.map((size) => <button key={size} type="button" aria-pressed={textSize === size} onClick={() => setTextSize(size)}>{TEXT_SIZE_LABELS[size]}</button>)}
              </div>
            </div>
            <button type="button" className="menu-item" aria-pressed={soundOn} onClick={toggleSound}><span>{soundOn ? '🔊' : '🔇'} Sounds</span><span className="switch">{soundOn ? 'On' : 'Off'}</span></button>
            <button type="button" className="menu-item" aria-pressed={musicOn} onClick={toggleMusic}><span>🎵 Music</span><span className="switch">{musicOn ? 'On' : 'Off'}</span></button>
            <button type="button" className="menu-item" onClick={() => { setShowMenu(false); setShowHelp(true); }}><span>❓ How to play</span></button>
            <button type="button" className="menu-item danger-text" onClick={() => { setShowMenu(false); setConfirmLeave(true); }}><span>🚪 Leave game</span></button>
            <button type="button" className="primary" onClick={() => setShowMenu(false)}>Back to the game</button>
          </div>
        </div>
      )}
      {showHelp && (
        <div className="dialog-backdrop" role="presentation" onClick={() => setShowHelp(false)}>
          <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="help-title" onClick={(event) => event.stopPropagation()}>
            <h2 id="help-title">How to play</h2>
            <HowToPlay />
            <button type="button" className="primary" onClick={() => setShowHelp(false)}>Got it</button>
          </div>
        </div>
      )}
      {confirmLeave && (
        <div className="dialog-backdrop" role="presentation" onClick={() => setConfirmLeave(false)}>
          <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="leave-title" onClick={(event) => event.stopPropagation()}>
            <h2 id="leave-title">Leave this game?</h2>
            <p>{state?.phase === 'playing' || state?.phase === 'countdown' ? 'Your cards will be taken out of the game.' : 'You can join again with the room code.'}</p>
            <div className="dialog-actions">
              <button type="button" className="secondary" onClick={() => setConfirmLeave(false)}>Stay</button>
              <button type="button" className="danger" onClick={leave}>Leave</button>
            </div>
          </div>
        </div>
      )}
      {hasSession && !connected && <div className="connection-banner" role="status">Reconnecting… Your seat and cards are kept for 60 seconds.</div>}
    </>
  );

  if (!state) {
    if (hasSession && !error) return <main className="screen centred"><p className="loading">Loading your game…</p>{dialogs}</main>;
    return (
      <main className="screen home">
        {toolbar}
        <div className="home-hero">
          <div className="hero-cards" aria-hidden="true"><span>🍅</span><span>🧀</span><span>🥕</span></div>
          <h1>Kitchen <em>Clash</em></h1>
          <p className="tagline">Spot the matching food faster than everyone else.</p>
        </div>
        <form className="panel home-form" onSubmit={start}>
          <label htmlFor="name">Your name</label>
          <input id="name" value={name} maxLength={16} autoComplete="nickname" onChange={(event) => setName(event.target.value)} placeholder="e.g. Nani" />
          <label htmlFor="code">Room code <span className="optional">(only if you are joining)</span></label>
          <input id="code" value={code} maxLength={6} autoCapitalize="characters" autoComplete="off" onChange={(event) => setCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} placeholder="ABC123" />
          {error && <p className="error" role="alert">{error}</p>}
          <button type="submit" className="primary big" disabled={!connected}>{code ? 'Join game' : 'Start a new game'}</button>
          {!connected && <p className="hint">Connecting…</p>}
        </form>
        {dialogs}
      </main>
    );
  }

  const you = state.you;
  const others = state.players.filter((player) => !player.isYou);
  const playerIndex = (player: PlayerState) => state.players.indexOf(player);

  if (state.phase === 'lobby') {
    const seated = state.players.length;
    const needed = Math.max(0, state.minPlayers - seated);
    return (
      <main className="screen lobby">
        {toolbar}
        <section className="panel">
          <p className="eyebrow">Room code</p>
          <p className="room-code" aria-label={`Room code ${state.roomCode.split('').join(' ')}`}>{state.roomCode}</p>
          <button type="button" className="secondary" onClick={share}>{copied ? 'Link copied ✓' : 'Invite people'}</button>
        </section>
        <section className="panel">
          <h2>Players <span className="count">{seated} of {state.maxPlayers}</span></h2>
          <ul className="player-list">
            {state.players.map((player) => (
              <li key={player.name} className={player.connected ? '' : 'offline'}>
                <Avatar player={player} index={playerIndex(player)} />
                <span className="player-name">{player.name}{player.isYou && ' (you)'}</span>
                {player.isHost && <span className="badge">Host</span>}
                {!player.connected && <span className="badge muted">Away</span>}
              </li>
            ))}
          </ul>
          {error && <p className="error" role="alert">{error}</p>}
          {state.isHost ? (
            <>
              <button type="button" className="primary big" disabled={!state.canStart} onClick={() => socketRef.current?.emit('start_game')}>Start game</button>
              {needed > 0 && <p className="hint">Waiting for {needed} more player{needed === 1 ? '' : 's'}. Share the room code.</p>}
              {needed === 0 && !state.canStart && <p className="hint">Waiting for everyone to reconnect.</p>}
            </>
          ) : <p className="hint big-hint">Waiting for {state.hostName} to start the game…</p>}
        </section>
        <section className="panel">
          <h2>How to play</h2>
          <HowToPlay />
        </section>
        {dialogs}
      </main>
    );
  }

  if (state.phase === 'finished') {
    const ranked = [...state.players].sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99));
    const myRank = you?.rank;
    return (
      <main className="screen results">
        {toolbar}
        <section className="panel">
          <p className="results-title">{myRank === 1 ? 'You won! 🏆' : myRank ? `You came ${ordinal(myRank)}` : 'Game over'}</p>
          <ol className="standings">
            {ranked.map((player) => (
              <li key={player.name} className={player.isYou ? 'is-you' : ''}>
                <span className="place">{player.left ? '–' : player.rank === 1 ? '🥇' : player.rank === 2 ? '🥈' : player.rank === 3 ? '🥉' : ordinal(player.rank ?? 0)}</span>
                <span className="player-name">{player.name}{player.isYou && ' (you)'}{player.left && <span className="badge muted">Left</span>}</span>
                <span className="stats">
                  <span>{player.wins} matched</span>
                  <span>{player.misses} wrong</span>
                  {player.averageSpotMs !== null && <span>avg {seconds(player.averageSpotMs)}</span>}
                </span>
              </li>
            ))}
          </ol>
          {error && <p className="error" role="alert">{error}</p>}
          {state.isHost
            ? <button type="button" className="primary big" disabled={!state.canStart} onClick={() => socketRef.current?.emit('start_game')}>Play again</button>
            : <p className="hint big-hint">Waiting for {state.hostName} to start another game…</p>}
          <button type="button" className="secondary" onClick={leave}>Leave</button>
        </section>
        {dialogs}
      </main>
    );
  }

  // Countdown and playing share the table.
  const sinceState = now - receivedAtRef.current;
  // Up to three opponents fit with names; more show as initials with a badge.
  const compact = others.length > 3;
  const countdown = state.phase === 'countdown' && state.countdownMs !== null ? Math.max(1, Math.ceil((state.countdownMs - sinceState) / 1000)) : null;
  const locked = lockRemaining > 0;
  const instruction = you?.rank
    ? `You finished ${ordinal(you.rank)}! Watching the others…`
    : 'Tap the picture that is on both cards.';

  return (
    <main className="screen table">
      <header className="table-header">
        <ul className={`opponents${compact ? ' compact' : ''}`} aria-label="Other players">
          {others.map((player) => (
            <li key={player.name} className={`opponent${player.connected ? '' : ' offline'}${player.rank ? ' done' : ''}`} aria-label={`${player.name}: ${player.rank ? `finished ${ordinal(player.rank)}` : player.connected ? `${player.cardsLeft} cards` : 'reconnecting'}`}>
              <Avatar player={player} index={playerIndex(player)} />
              <span className="opponent-text" aria-hidden="true">
                <span className="opponent-name">{player.name}</span>
                <span className="opponent-count">
                  {player.rank ? (compact ? '🏅' : `🏅 ${ordinal(player.rank)}`) : player.reconnectMs !== null ? (compact ? '⏳' : `⏳ ${Math.max(0, Math.ceil((player.reconnectMs - sinceState) / 1000))}s`) : <>{player.cardsLeft}<span className="unit"> cards</span></>}
                </span>
              </span>
            </li>
          ))}
        </ul>
        <button type="button" className="tool-button menu-button" onClick={() => setShowMenu(true)} aria-label="Menu: text size, sound, music, help, leave">☰</button>
      </header>

      <section className="card-slot centre-slot" aria-label="Middle card">
        {state.centre && <KitchenCard card={state.centre} seed={`centre:${state.roundId}`} label="Middle card" />}
        <p className="slot-label">Middle card</p>
      </section>

      <p className={`table-message tone-${message?.tone || (roundEnding && !locked ? 'warn' : 'info')}`} role="status" aria-live="polite" key={message?.key}>
        {locked ? `Not that one. Wait ${seconds(lockRemaining)}…` : message?.text || (roundEnding && !you?.rank ? `No match yet. New middle card in ${Math.max(1, Math.ceil(roundEndsIn / 1000))} s` : instruction)}
      </p>

      <section className="card-slot your-slot" aria-label="Your card">
        {you?.topCard ? (
          <>
            <KitchenCard card={you.topCard} seed={`you:${you.name}`} label="Your card" onPick={claim} disabled={locked || countdown !== null} shake={shake} />
            {locked && (
              <div className="lockout" aria-hidden="true">
                <svg viewBox="0 0 36 36"><circle className="lockout-track" r="16" cx="18" cy="18" /><circle className="lockout-fill" r="16" cx="18" cy="18" style={{ strokeDashoffset: `${100 - (lockRemaining / 1500) * 100}` }} pathLength={100} /></svg>
                <span>⏳</span>
              </div>
            )}
          </>
        ) : (
          <div className="finished-card"><span aria-hidden="true">🏅</span><p>{you?.rank ? `You finished ${ordinal(you.rank)}!` : 'Out of cards'}</p></div>
        )}
        <p className="slot-label">Your card{you?.topCard ? ` · ${you.cardsLeft} left` : ''}</p>
      </section>

      {countdown !== null && (
        <div className="countdown" role="status" aria-live="assertive">
          <p>Get ready…</p>
          <span key={countdown}>{countdown}</span>
        </div>
      )}
      {dialogs}
    </main>
  );
}
