import { useCallback, useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { io, type Socket } from 'socket.io-client';
import KitchenCard from './KitchenCard';
import Solo from './Solo';
import type { SoloMode } from './solo';
import { HOW_TO, HowToSteps } from './howto';
import { ITEMS } from './items';
import { isMusicOn, resumeMusicIfOn, setMusicOn } from './music';
import { isSoundOn, playFinish, playOtherWin, playWin, playWrong, setSoundOn, unlockAudio } from './sounds';
import type { ClaimResult, GameMode, GameState, PlayerState, RoomSummary } from './types';

const SESSION_KEY = 'kitchen-clash-session';
const NAME_KEY = 'kitchen-clash-name';
const TEXT_SIZE_KEY = 'kitchen-clash-text-size';
const TEXT_SIZES = ['normal', 'large', 'larger'] as const;
type TextSize = typeof TEXT_SIZES[number];
const TEXT_SIZE_LABELS: Record<TextSize, string> = { normal: 'A', large: 'A+', larger: 'A++' };
// Show the no-match countdown only near the end of a stuck round.
const ROUND_WARNING_MS = 15_000;
const AVATAR_COLOURS = ['#c93a22', '#1d7a4a', '#a66200', '#2563a8', '#8a3fa0', '#0f6f78'];

type Tone = 'info' | 'good' | 'bad';
// `itemId` is the picture a finished round was won with; `who` is its winner.
interface Message { text: string; tone: Tone; key: number; itemId?: number; who?: string }
type Arrival = 'from-you' | 'from-other' | 'fresh';

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

const GAME_MODES: GameMode[] = ['race', 'tower', 'hot-potato'];
const SOLO_MODES: SoloMode[] = ['classic', 'time-attack', 'daily'];
const HOT_POTATO_MAX = 4;

// A list of games to pick from, one big button each. A game that cannot be
// picked says why instead of its tagline.
function GameChoices<K extends GameMode | SoloMode>({ modes, selected, label, unavailable, onPick }: { modes: K[]; selected?: K; label: string; unavailable?: (mode: K) => string | null; onPick: (mode: K) => void }) {
  return (
    <div className="mode-picker" role="group" aria-label={label}>
      {modes.map((mode) => {
        const reason = unavailable?.(mode) ?? null;
        return (
          <button key={mode} type="button" className="mode-button" aria-pressed={selected === undefined ? undefined : selected === mode} disabled={Boolean(reason)} onClick={() => onPick(mode)}>
            <span className="mode-emoji" aria-hidden="true">{HOW_TO[mode].emoji}</span>
            <span className="mode-text"><strong>{HOW_TO[mode].name}</strong><small>{reason ?? HOW_TO[mode].tagline}</small></span>
          </button>
        );
      })}
    </div>
  );
}

// The chosen game as one line. The host can open the choices to change it.
function GameLine({ label, mode, seated = 0, onPick }: { label: string; mode: GameMode; seated?: number; onPick?: (mode: GameMode) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="game-line">
      <p className="game-line-label">{label}</p>
      <div className="game-line-row">
        <p><span aria-hidden="true">{HOW_TO[mode].emoji}</span> <strong>{HOW_TO[mode].name}</strong></p>
        {onPick && <button type="button" className="link-button" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? 'Close' : 'Change'}</button>}
      </div>
      {open && onPick
        ? <GameChoices modes={GAME_MODES} selected={mode} label={label} unavailable={(item) => (item === 'hot-potato' && seated > HOT_POTATO_MAX ? `Up to ${HOT_POTATO_MAX} players` : null)} onPick={(next) => { onPick(next); setOpen(false); }} />
        : <p className="game-line-text">{HOW_TO[mode].tagline}</p>}
    </div>
  );
}

// How a pile is counted: a Race pile counts down, a Tower counts up.
function pileWords(mode: GameMode, count: number) {
  const cards = `${count} ${count === 1 ? 'card' : 'cards'}`;
  return mode === 'tower' ? { text: `🥞 ${count}`, label: `Tower of ${cards}` } : { text: `${count} left`, label: `${cards} left` };
}

type Screen = 'home' | 'friends' | 'alone' | 'create' | 'join';
const SCREENS: Screen[] = ['home', 'friends', 'alone', 'create', 'join'];
const historyDepth = () => Number(window.history.state?.depth) || 0;

// How to play: the game being played, or every game when none is.
function HowToPlay({ mode }: { mode?: GameMode | SoloMode }) {
  const modes = mode ? [mode] : [...GAME_MODES, ...SOLO_MODES];
  return (
    <div className="how-to-all">
      {modes.map((item) => (
        <section key={item}>
          {!mode && <h3>{HOW_TO[item].emoji} {HOW_TO[item].name}</h3>}
          <HowToSteps mode={item} />
        </section>
      ))}
      <p className="how-to-tip"><span aria-hidden="true">🔄</span> Turn your card by sliding a finger around it, or press ↻.</p>
    </div>
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
  const [newMode, setNewMode] = useState<GameMode>('race');
  const [screen, setScreen] = useState<Screen>(() => (inviteCodeFromPath() ? 'join' : 'home'));
  // What an invite link or typed code points at: undefined while unknown, null when there is no such room.
  const [roomInfo, setRoomInfo] = useState<RoomSummary | null | undefined>(undefined);
  const nameRef = useRef<HTMLInputElement | null>(null);
  const codeRef = useRef<HTMLInputElement | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState<Message | null>(null);
  const [lockedUntil, setLockedUntil] = useState(0);
  const [shake, setShake] = useState(0);
  const [nudge, setNudge] = useState(0);
  const [solo, setSolo] = useState<SoloMode | null>(null);
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

  const [wrongItem, setWrongItem] = useState<number | null>(null);
  const [arrival, setArrival] = useState<Arrival>('fresh');

  // Focuses a dialog's heading once when it opens, so it opens at the top.
  const focusOnMount = useCallback((element: HTMLElement | null) => element?.focus(), []);
  const say = useCallback((text: string, tone: Tone, extra: { itemId?: number; who?: string } = {}) => setMessage({ text, tone, key: performance.now(), ...extra }), []);

  useEffect(() => {
    document.documentElement.dataset.textSize = textSize;
    window.localStorage.setItem(TEXT_SIZE_KEY, textSize);
  }, [textSize]);

  // Every screen gets its own history entry, so the phone's Back button steps
  // back through them. In a room, Back asks before leaving it.
  useEffect(() => {
    window.history.replaceState({ kc: inviteCodeFromPath() ? 'join' : 'home', depth: 0 }, '');
    const onPop = (event: PopStateEvent) => {
      if (stateRef.current) {
        window.history.pushState({ kc: 'room', depth: historyDepth() + 1 }, '', `/kitchen-clash/r/${stateRef.current.roomCode}`);
        setConfirmLeave(true);
        return;
      }
      const kc = event.state?.kc;
      setSolo(null);
      setError('');
      setScreen(SCREENS.includes(kc) ? kc : 'home');
    };
    // A page the browser kept from before may be stale, so load it afresh.
    const onShow = (event: PageTransitionEvent) => { if (event.persisted) window.location.reload(); };
    window.addEventListener('popstate', onPop);
    window.addEventListener('pageshow', onShow);
    return () => {
      window.removeEventListener('popstate', onPop);
      window.removeEventListener('pageshow', onShow);
    };
  }, []);

  useEffect(() => {
    if (screen !== 'join' || code.length !== 6 || !connected) return setRoomInfo(undefined);
    let current = true;
    socketRef.current?.timeout(5_000).emit('room_info', { roomCode: code }, (timeout: Error | null, info: RoomSummary | null) => {
      if (current) setRoomInfo(timeout ? undefined : info);
    });
    return () => { current = false; };
  }, [screen, code, connected]);

  useEffect(() => {
    const unlock = () => {
      unlockAudio();
      resumeMusicIfOn();
    };
    // iPhones only count the end of a touch as a tap that may start audio.
    const events = ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown'];
    events.forEach((name) => window.addEventListener(name, unlock, { passive: true }));
    return () => events.forEach((name) => window.removeEventListener(name, unlock));
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
      // The room gets its own history entry, so Back from it asks before leaving.
      const roomUrl = `/kitchen-clash/r/${session.roomCode}`;
      if (window.history.state?.kc === 'room') window.history.replaceState(window.history.state, '', roomUrl);
      else window.history.pushState({ kc: 'room', depth: historyDepth() + 1 }, '', roomUrl);
    });
    socket.on('session_invalid', () => {
      window.sessionStorage.removeItem(SESSION_KEY);
      setHasSession(false);
      setState(null);
      stateRef.current = null;
      setScreen('home');
      setError('That game has ended or your seat expired. Start or join a new game.');
    });
    socket.on('error_message', (text: string) => setError(text));
    socket.on('state', (next: GameState) => {
      const previous = stateRef.current;
      receivedAtRef.current = performance.now();
      if (next.lastWin && next.lastWin.roundId !== previous?.lastWin?.roundId && previous?.phase === 'playing') {
        const mine = next.lastWin.name === next.you?.name;
        const to = next.lastWin.to;
        if (to) {
          // Hot Potato: a pass from one player to another.
          const me = next.you?.name;
          if (mine) say(`Passed to ${to}!`, 'good', { itemId: next.lastWin.itemId });
          else if (to === me) say(`${next.lastWin.name} passed to you!`, 'bad', { itemId: next.lastWin.itemId, who: next.lastWin.name });
          else say(`${next.lastWin.name} passed to ${to}.`, 'info', { itemId: next.lastWin.itemId, who: next.lastWin.name });
          if (mine) playWin(); else playOtherWin();
          if (mine) navigator.vibrate?.(30);
          setArrival('fresh');
        } else if (mine) {
          say(next.mode === 'tower' ? 'You won the card!' : 'You got it!', 'good', { itemId: next.lastWin.itemId });
          setArrival('from-you');
          playWin();
          navigator.vibrate?.(30);
        } else {
          say(pendingRoundRef.current === next.lastWin.roundId ? `So close! ${next.lastWin.name} was faster.` : `${next.lastWin.name} got it.`, 'info', { itemId: next.lastWin.itemId, who: next.lastWin.name });
          setArrival('from-other');
          playOtherWin();
        }
        pendingRoundRef.current = null;
      }
      if (next.refreshedRoundId !== null && next.refreshedRoundId !== previous?.refreshedRoundId && previous?.phase === 'playing') {
        say('Nobody found it. Here is a new middle card!', 'info');
        setArrival('fresh');
        pendingRoundRef.current = null;
      }
      if (next.phase === 'countdown' && previous?.phase !== 'countdown') {
        if (previous?.phase === 'playing' && next.lastDeal) playFinish();
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

  const dialogOpen = showMenu || showHelp || confirmLeave;
  useEffect(() => {
    if (!dialogOpen) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setShowMenu(false);
      setShowHelp(false);
      setConfirmLeave(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dialogOpen]);

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
          setWrongItem(itemId);
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

  // A tap on the middle card never counts; the player's own card answers with a nudge.
  const tapAside = () => {
    if (stateRef.current?.phase !== 'playing' || !stateRef.current.you?.topCard) return;
    setNudge((value) => value + 1);
  };

  const pickMode = (mode: GameMode) => socketRef.current?.emit('set_mode', mode);

  const go = (next: Screen) => {
    setError('');
    window.history.pushState({ kc: next, depth: historyDepth() + 1 }, '', window.location.pathname);
    setScreen(next);
  };
  const back = () => {
    setError('');
    if (historyDepth() > 0) return window.history.back();
    // Arrived straight on this screen, such as from an invite link.
    window.history.replaceState({ kc: 'home', depth: 0 }, '', '/kitchen-clash/');
    setCode('');
    setScreen('home');
  };
  const startSolo = (mode: SoloMode) => {
    window.history.pushState({ kc: 'solo', depth: historyDepth() + 1 }, '', window.location.pathname);
    setSolo(mode);
  };
  const exitSolo = () => (window.history.state?.kc === 'solo' ? window.history.back() : setSolo(null));

  const start = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    const joining = screen === 'join';
    if (joining && code.length !== 6) {
      codeRef.current?.focus();
      return setError('Type the 6 letters of the room code.');
    }
    if (!trimmed) {
      nameRef.current?.focus();
      return setError('Please type your name first.');
    }
    window.localStorage.setItem(NAME_KEY, trimmed);
    setError('');
    if (joining) socketRef.current?.emit('join_room', { roomCode: code, name: trimmed });
    else socketRef.current?.emit('create_room', { name: trimmed, mode: newMode });
  };

  const leave = () => {
    setConfirmLeave(false);
    if (solo) return exitSolo();
    const finish = () => {
      window.sessionStorage.removeItem(SESSION_KEY);
      setHasSession(false);
      setState(null);
      stateRef.current = null;
      setCode('');
      setScreen('home');
      window.history.replaceState({ kc: 'home', depth: 0 }, '', '/kitchen-clash/');
    };
    const socket = socketRef.current;
    if (socket?.connected) socket.timeout(2_000).emit('leave_room', finish);
    else finish();
  };

  const share = async () => {
    if (!state) return;
    const url = `${window.location.origin}/kitchen-clash/r/${state.roomCode}`;
    try {
      if (navigator.share) await navigator.share({ title: 'Kitchen Clash', text: `Join my Kitchen Clash game: ${HOW_TO[state.mode].name}. Room code ${state.roomCode}`, url });
      else {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2_000);
      }
    } catch { /* The player closed the share sheet. */ }
  };

  const toggleSound = () => {
    setSoundOn(!soundOn);
    setSoundOnState(!soundOn);
    // Let the player hear that sound is now on.
    if (!soundOn) {
      unlockAudio();
      playWin();
    }
  };
  const toggleMusic = () => { setMusicOn(!musicOn); setMusicOnState(!musicOn); };

  const inGame = state?.phase === 'playing' || state?.phase === 'countdown';
  const dialogs = (
    <>
      {showMenu && (
        <div className="dialog-backdrop" role="presentation" onClick={() => setShowMenu(false)}>
          <div className="dialog menu" role="dialog" aria-modal="true" aria-labelledby="menu-title" onClick={(event) => event.stopPropagation()}>
            <div className="dialog-head">
              <h2 id="menu-title">Menu</h2>
              <button type="button" className="close-button" autoFocus onClick={() => setShowMenu(false)} aria-label="Close menu">✕</button>
            </div>
            <div className="menu-row">
              <span id="text-size-label">Size</span>
              <div className="segmented" role="group" aria-labelledby="text-size-label">
                {TEXT_SIZES.map((size) => <button key={size} type="button" aria-pressed={textSize === size} aria-label={`${size === 'normal' ? 'Normal' : size === 'large' ? 'Large' : 'Largest'} cards and text`} onClick={() => setTextSize(size)}>{TEXT_SIZE_LABELS[size]}</button>)}
              </div>
            </div>
            <button type="button" className="menu-item" role="switch" aria-checked={soundOn} onClick={toggleSound}><span>{soundOn ? '🔊' : '🔇'} Sounds</span><span className="switch">{soundOn ? 'On' : 'Off'}</span></button>
            <button type="button" className="menu-item" role="switch" aria-checked={musicOn} onClick={toggleMusic}><span>🎵 Music</span><span className="switch">{musicOn ? 'On' : 'Off'}</span></button>
            <p className="credit">Music by Les Trouble, Swayroom, Toby Tech, Beau Vallon, longwayfromhome and Majken</p>
            <button type="button" className="menu-item" onClick={() => { setShowMenu(false); setShowHelp(true); }}><span>❓ How to play</span><span aria-hidden="true">›</span></button>
            {(state || solo) && <button type="button" className="menu-item danger-text" onClick={() => { setShowMenu(false); setConfirmLeave(true); }}><span>🚪 Leave game</span><span aria-hidden="true">›</span></button>}
          </div>
        </div>
      )}
      {showHelp && (
        <div className="dialog-backdrop" role="presentation" onClick={() => setShowHelp(false)}>
          <div className="dialog help" role="dialog" aria-modal="true" aria-labelledby="help-title" onClick={(event) => event.stopPropagation()}>
            <h2 id="help-title" tabIndex={-1} ref={focusOnMount}>How to play</h2>
            <div className="help-body"><HowToPlay mode={solo ?? state?.mode} /></div>
            <button type="button" className="primary" onClick={() => setShowHelp(false)}>Got it</button>
          </div>
        </div>
      )}
      {confirmLeave && (
        <div className="dialog-backdrop" role="presentation" onClick={() => setConfirmLeave(false)}>
          <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="leave-title" onClick={(event) => event.stopPropagation()}>
            <h2 id="leave-title">Leave this game?</h2>
            <p>{solo ? 'Your solo game will end.' : inGame ? 'Your cards will be taken out of the game.' : 'You can join again with the room code.'}</p>
            <div className="dialog-actions">
              <button type="button" className="secondary" autoFocus onClick={() => setConfirmLeave(false)}>Stay</button>
              <button type="button" className="danger" onClick={leave}>Leave</button>
            </div>
          </div>
        </div>
      )}
      {hasSession && !connected && <div className="connection-banner" role="status">Reconnecting… Your seat and cards are kept for 60 seconds.</div>}
    </>
  );

  if (solo) {
    const menuButton = <button type="button" className="tool-button menu-button" onClick={() => setShowMenu(true)} aria-label="Menu: size, sound, music, help, leave">☰</button>;
    return <><Solo key={solo} mode={solo} menu={menuButton} onExit={exitSolo} pictureSize={textSize} />{dialogs}</>;
  }

  const menuButton = <button type="button" className="tool-button menu-button" onClick={() => setShowMenu(true)} aria-label="Menu: size, sound, music, how to play">☰<span className="menu-word"> Menu</span></button>;
  const stepBar = (
    <header className="top-bar">
      <button type="button" className="tool-button" onClick={back}>‹ Back</button>
      {menuButton}
    </header>
  );
  const nameField = (
    <>
      <label htmlFor="name">Your name</label>
      <input ref={nameRef} id="name" value={name} maxLength={16} autoComplete="nickname" enterKeyHint="go" onChange={(event) => setName(event.target.value)} placeholder="e.g. Nani" />
      {error && <p className="error" role="alert">{error}</p>}
    </>
  );

  if (!state) {
    if (hasSession && !error) return <main className="screen centred"><p className="loading">Loading your game…</p>{dialogs}</main>;

    if (screen === 'friends' || screen === 'alone') {
      return (
        <main className="screen home step">
          {stepBar}
          <section className="panel">
            <h1 className="step-title">{screen === 'friends' ? 'Pick a game' : 'Play alone'}</h1>
            {screen === 'friends'
              ? <GameChoices modes={GAME_MODES} label="Game" onPick={(mode) => { setNewMode(mode); go('create'); }} />
              : <GameChoices modes={SOLO_MODES} label="Solo game" onPick={startSolo} />}
          </section>
          {dialogs}
        </main>
      );
    }

    if (screen === 'create') {
      return (
        <main className="screen home step">
          {stepBar}
          <form className="panel home-form" onSubmit={start} noValidate>
            <GameLine label="New game" mode={newMode} onPick={setNewMode} />
            {nameField}
            <button type="submit" className="primary big" disabled={!connected}>Create game</button>
            {!connected && <p className="hint">Connecting…</p>}
          </form>
          {dialogs}
        </main>
      );
    }

    if (screen === 'join') {
      const found = roomInfo && roomInfo.hostName;
      return (
        <main className="screen home step">
          {stepBar}
          <form className="panel home-form" onSubmit={start} noValidate>
            {found ? (
              <>
                <h1 className="step-title">Join {roomInfo.hostName}’s game</h1>
                <p className="join-game"><span aria-hidden="true">{HOW_TO[roomInfo.mode].emoji}</span> <strong>{HOW_TO[roomInfo.mode].name}</strong> · {roomInfo.seats} of {roomInfo.maxPlayers} players</p>
                {roomInfo.phase !== 'lobby' && <p className="hint left">{roomInfo.phase === 'finished' ? 'They just finished a game.' : 'A game is in progress.'} You will be dealt in to the next one.</p>}
              </>
            ) : (
              <>
                <h1 className="step-title">Join a game</h1>
                <label htmlFor="code">Room code</label>
                <input ref={codeRef} id="code" value={code} maxLength={6} autoCapitalize="characters" autoComplete="off" autoCorrect="off" spellCheck={false} enterKeyHint="next" aria-describedby="code-hint" onChange={(event) => setCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} placeholder="ABC123" />
                <p className="hint left" id="code-hint">{roomInfo === null ? 'We could not find that room. Check the code.' : '6 letters or numbers. Ask the person who started the game.'}</p>
              </>
            )}
            {nameField}
            <button type="submit" className="primary big" disabled={!connected || roomInfo === null}>Join game</button>
            {!connected && <p className="hint">Connecting…</p>}
          </form>
          {dialogs}
        </main>
      );
    }

    return (
      <main className="screen home">
        <header className="top-bar"><span />{menuButton}</header>
        <div className="home-hero">
          <div className="hero-cards" aria-hidden="true"><span>🍅</span><span>🧀</span><span>🥕</span></div>
          <h1>Kitchen <em>Clash</em></h1>
          <p className="tagline">Spot the matching food faster than everyone else.</p>
        </div>
        <section className="panel home-actions">
          {error && <p className="error" role="alert">{error}</p>}
          <button type="button" className="primary big" onClick={() => go('friends')}>Play with friends</button>
          <button type="button" className="secondary" onClick={() => { setCode(''); go('join'); }}>Join with a code</button>
          <button type="button" className="secondary" onClick={() => go('alone')}>Play alone</button>
        </section>
        {dialogs}
      </main>
    );
  }

  const you = state.you;
  const others = state.players.filter((player) => !player.isYou);
  const playerIndex = (player: PlayerState) => state.players.indexOf(player);
  const seatedNow = state.players.filter((player) => !player.left).length;
  const needed = Math.max(0, state.minPlayers - seatedNow);
  const topBar = <header className="top-bar"><span className="brand">Kitchen <em>Clash</em></span>{menuButton}</header>;
  const inviteButton = (loud: boolean) => <button type="button" className={loud ? 'primary big' : 'secondary'} onClick={share}>{copied ? 'Link copied ✓' : 'Invite people'}</button>;
  const playerList = (
    <ul className="player-list">
      {state.players.filter((player) => !player.left).map((player) => (
        <li key={player.name} className={player.connected ? '' : 'offline'}>
          <Avatar player={player} index={playerIndex(player)} />
          <span className="player-name">{player.name}</span>
          {player.isYou && <span className="badge you">You</span>}
          {player.isHost && <span className="badge">Host</span>}
          {player.waiting && state.phase !== 'lobby' && <span className="badge muted">Next game</span>}
          {!player.connected && <span className="badge muted">Away</span>}
        </li>
      ))}
    </ul>
  );

  if (state.phase === 'lobby') {
    return (
      <main className="screen lobby">
        {topBar}
        <section className="panel">
          <GameLine label="Game" mode={state.mode} seated={seatedNow} onPick={state.isHost ? pickMode : undefined} />
          <div className="room-box">
            <p className="eyebrow">Room code</p>
            <p className="room-code" aria-label={`Room code ${state.roomCode.split('').join(' ')}`}>{state.roomCode}</p>
          </div>
          {inviteButton(needed > 0)}
        </section>
        <section className="panel">
          <h2>Players <span className="count">{seatedNow} of {state.maxPlayers}</span></h2>
          {playerList}
        </section>
        <section className="panel">
          <h2>How to play {HOW_TO[state.mode].name}</h2>
          <HowToSteps mode={state.mode} />
        </section>
        <div className="action-bar">
          {error && <p className="error" role="alert">{error}</p>}
          {!state.isHost
            ? <p className="hint big-hint">Waiting for {state.hostName} to start…</p>
            : needed > 0
              ? <p className="hint big-hint">Waiting for {needed} more player{needed === 1 ? '' : 's'}…</p>
              : <>
                  <button type="button" className="primary big" disabled={!state.canStart} onClick={() => socketRef.current?.emit('start_game')}>Start game</button>
                  {!state.canStart && <p className="hint">Waiting for everyone to reconnect.</p>}
                </>}
        </div>
        {dialogs}
      </main>
    );
  }

  if (state.phase === 'finished') {
    const result = state.result;
    const played = result?.mode ?? state.mode;
    const rows = [...(result?.players ?? [])].sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99));
    const mine = rows.find((row) => row.name === you?.name);
    const waitingNames = state.players.filter((player) => player.waiting && !player.left).map((player) => player.name);
    return (
      <main className="screen results">
        {topBar}
        <section className="panel">
          <p className="eyebrow">{HOW_TO[played].emoji} {HOW_TO[played].name} · results</p>
          <h1 className="results-title">{mine?.rank === 1 ? 'You won! 🏆' : mine?.rank ? `You came ${ordinal(mine.rank)}` : 'Game over'}</h1>
          <ol className="standings">
            {rows.map((row) => (
              <li key={row.name} className={row.name === you?.name ? 'is-you' : ''}>
                <span className="place">{!row.rank ? '–' : row.rank === 1 ? '🥇' : row.rank === 2 ? '🥈' : row.rank === 3 ? '🥉' : ordinal(row.rank)}</span>
                <span className="player-name">{row.name}{row.name === you?.name && <span className="badge you">You</span>}{row.left && <span className="badge muted">Left</span>}</span>
                <span className="stats">
                  {played === 'tower' && <span>🥞 {row.tower} high</span>}
                  {played === 'hot-potato' && <span>😬 {row.losses} lost</span>}
                  <span>{row.wins} {played === 'hot-potato' ? 'passed' : played === 'tower' ? 'won' : 'matched'}</span>
                  <span>{row.misses} wrong</span>
                  {row.averageSpotMs !== null && <span>avg {seconds(row.averageSpotMs)}</span>}
                </span>
              </li>
            ))}
          </ol>
        </section>
        <section className="panel">
          <GameLine label="Next game" mode={state.mode} seated={seatedNow} onPick={state.isHost ? pickMode : undefined} />
          {waitingNames.length > 0 && <p className="hint left">{waitingNames.join(', ')} will play the next game.</p>}
          {needed > 0 && (
            <>
              <p className="hint left">Everyone else has left. You need {needed} more player{needed === 1 ? '' : 's'} to play again.</p>
              {inviteButton(true)}
            </>
          )}
        </section>
        <div className="action-bar">
          {error && <p className="error" role="alert">{error}</p>}
          {state.isHost
            ? needed === 0 && <button type="button" className="primary big" disabled={!state.canStart} onClick={() => socketRef.current?.emit('start_game')}>Play again</button>
            : <p className="hint big-hint">Waiting for {state.hostName} to start the next game…</p>}
          <button type="button" className="link-button" onClick={() => setConfirmLeave(true)}>Back to home</button>
        </div>
        {dialogs}
      </main>
    );
  }

  // Joined while a game was running: wait here for the next one.
  if (you?.waiting) {
    return (
      <main className="screen lobby">
        {topBar}
        <section className="panel">
          <p className="eyebrow">{HOW_TO[state.mode].emoji} {HOW_TO[state.mode].name}</p>
          <h1 className="step-title">{state.hostName}’s game is in progress</h1>
          <p className="hint left">You will be dealt in to the next game. Stay on this screen.</p>
          {playerList}
        </section>
        <section className="panel">
          <h2>How to play {HOW_TO[state.mode].name}</h2>
          <HowToSteps mode={state.mode} />
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
  const potato = state.mode === 'hot-potato';
  const instruction = you?.rank
    ? `You finished ${ordinal(you.rank)}! Watching the others…`
    : potato
      ? (you?.topCard ? 'Match a card above. Tap it on yours.' : 'You are safe! Wait for the next deal.')
      : 'Find the picture on both cards. Tap it on yours.';
  const opponentCards = potato ? others.filter((player) => !player.left && !player.waiting) : [];
  const yourPile = you && !potato ? pileWords(state.mode, you.cardsLeft) : null;
  const warning = roundEnding && !you?.rank && roundEndsIn !== null ? `No match yet. New middle card in ${Math.max(1, Math.ceil(roundEndsIn / 1000))} s` : '';
  const statusText = message?.text || (locked ? 'Not that one. Wait a moment…' : warning || instruction);
  const statusTone = message?.tone || (locked ? 'bad' : warning ? 'warn' : 'info');

  return (
    <main className={`screen table${potato ? ' potato' : ''}`}>
      <header className="table-header">
        {/* Hot Potato names everyone under their card instead. */}
        <ul className={`opponents${compact ? ' compact' : ''}`} aria-label="Other players" hidden={potato}>
          {others.filter((player) => !player.waiting).map((player) => (
            <li key={player.name} className={`opponent${player.connected ? '' : ' offline'}${player.rank ? ' done' : ''}${message?.who === player.name ? ' just-won' : ''}`} aria-label={`${player.name}: ${player.rank ? `finished ${ordinal(player.rank)}` : player.connected ? pileWords(state.mode, player.cardsLeft).label : 'reconnecting'}`}>
              <Avatar player={player} index={playerIndex(player)} />
              <span className="opponent-text" aria-hidden="true">
                <span className="opponent-name">{player.name}</span>
                <span className="opponent-count">
                  {player.rank ? (compact ? '🏅' : `🏅 ${ordinal(player.rank)}`) : player.reconnectMs !== null ? (compact ? '⏳' : `⏳ ${Math.max(0, Math.ceil((player.reconnectMs - sinceState) / 1000))}s`) : compact ? player.cardsLeft : pileWords(state.mode, player.cardsLeft).text}
                </span>
              </span>
            </li>
          ))}
        </ul>
        {state.mode === 'tower' && state.deckLeft !== null && <div className="mode-chip" aria-label={`${state.deckLeft} cards left in the deck`}><span aria-hidden="true">🃏</span> {state.deckLeft}{compact ? "" : " left"}</div>}
        {potato && state.deal > 0 && <div className="mode-chip" aria-label={`Deal ${state.deal} of ${state.totalDeals}`}><span aria-hidden="true">🥔</span> Deal {state.deal}/{state.totalDeals}</div>}
        <button type="button" className="tool-button menu-button" onClick={() => setShowMenu(true)} aria-label="Menu: size, sound, music, help, leave">☰</button>
      </header>

      {potato ? (
        // Hot Potato has no middle card: everyone else's card is on the table.
        <section className={`card-slot centre-slot potato-cards count-${opponentCards.length}`} aria-label="Other players' cards">
          {countdown === null && opponentCards.map((player) => (
            <div key={player.name} className={`potato-card${player.topCard ? '' : ' safe'}${player.connected ? '' : ' offline'}`}>
              {player.topCard
                ? <div key={player.topCard.id} className="arrive arrive-fresh"><KitchenCard card={player.topCard} seed={`opp:${player.name}:${player.topCard.id}`} label={`${player.name}'s card`} onTapAside={tapAside} pictureSize={textSize} /></div>
                : <div className="safe-plate" aria-label={`${player.name} is safe`}><span aria-hidden="true">😎</span></div>}
              <p className="potato-name" aria-hidden="true"><Avatar player={player} index={playerIndex(player)} /><span>{player.name}</span>{player.cardsLeft > 1 && <span className="potato-count">{player.cardsLeft}</span>}</p>
            </div>
          ))}
        </section>
      ) : (
      <section className="card-slot centre-slot" aria-label="Middle card">
        {/* The arrival only plays after the server settled the round. */}
        {state.centre && countdown === null && <div key={state.roundId} className={`arrive arrive-${arrival}`}><KitchenCard card={state.centre} seed={`centre:${state.roundId}`} label="Middle card" onTapAside={tapAside} pictureSize={textSize} /></div>}
      </section>
      )}

      <p className={`table-message tone-${statusTone}`} role="status" aria-live="polite" key={message?.key}>
        {message?.itemId !== undefined && <span className="message-item" role="img" aria-label={ITEMS[message.itemId].name}>{ITEMS[message.itemId].emoji}</span>}
        <span>{statusText}</span>
      </p>

      <section className="card-slot your-slot" aria-label="Your card">
        {you?.topCard ? (
          countdown === null && <div key={you.topCard.id} className="hand"><KitchenCard card={you.topCard} seed={`you:${you.name}`} label="Your card" onPick={claim} disabled={locked} shake={locked ? shake : 0} nudge={nudge} pile={you.cardsLeft} pileText={yourPile?.text} pileLabel={yourPile?.label} wrongItemId={locked ? wrongItem : null} lockFraction={locked ? Math.min(1, lockRemaining / 1500) : 0} pictureSize={textSize} /></div>
        ) : (
          countdown === null && (potato && !you?.rank
            ? <div className="finished-card safe"><span aria-hidden="true">😎</span><p>Safe!</p></div>
            : <div className="finished-card"><span aria-hidden="true">🏅</span><p>{you?.rank ? `You finished ${ordinal(you.rank)}!` : 'Out of cards'}</p></div>)
        )}
      </section>

      {countdown !== null && (
        <div className="countdown" role="status" aria-live="assertive">
          {potato && state.lastDeal && (
            <p className="deal-result">{state.lastDeal.loser === null ? 'Nobody got stuck.' : state.lastDeal.loser === you?.name ? `😬 You got stuck with ${state.lastDeal.cards} cards!` : `😬 ${state.lastDeal.loser} got stuck with ${state.lastDeal.cards} cards!`}</p>
          )}
          <p>{potato ? `🥔 Deal ${state.deal + 1} of ${state.totalDeals}` : `${HOW_TO[state.mode].emoji} ${HOW_TO[state.mode].name}`}</p>
          <span key={countdown}>{countdown}</span>
        </div>
      )}
      {dialogs}
    </main>
  );
}
