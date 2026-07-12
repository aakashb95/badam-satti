import { useEffect, useMemo, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import CardView from './CardView';
import GameBoard from './GameBoard';
import GameDeskLink from './GameDeskLink';
import HelpModal from './HelpModal';
import ResultsScreen from './ResultsScreen';
import type { Card, ComfortSize, GameState, MovePileAction, PlayCardAction } from './types';

const SESSION_KEY = 'kings-corner-session';
const COMFORT_KEY = 'kings-corner-comfort-size';
const COMFORT_SIZES: ComfortSize[] = ['standard', 'large', 'extra-large', 'maximum'];
const COMFORT_BUTTON_LABELS: Record<ComfortSize, string> = { standard: 'A', large: 'A+', 'extra-large': 'A++', maximum: 'A++++' };
const LOBBY_GREETINGS = [
  { lead: 'Welcome', punctuation: '.' },
  { lead: 'Ready', punctuation: '?' },
  { lead: 'Table’s open', punctuation: '.' },
  { lead: 'All set', punctuation: '?' },
];

function LobbyGreeting({ name }: { name: string }) {
  const [greeting] = useState(() => LOBBY_GREETINGS[Math.floor(Math.random() * LOBBY_GREETINGS.length)] || LOBBY_GREETINGS[0]);
  return <h1>{greeting.lead}, <em>{name}</em>{greeting.punctuation}</h1>;
}

function useCountdown(deadline: number | null) {
  const [remaining, setRemaining] = useState(20);
  useEffect(() => {
    const update = () => setRemaining(deadline ? Math.max(0, Math.ceil((deadline - Date.now()) / 1000)) : 20);
    update();
    const timer = window.setInterval(update, 200);
    return () => window.clearInterval(timer);
  }, [deadline]);
  return remaining;
}

function inviteCodeFromPath() {
  const match = window.location.pathname.match(/\/kings-corner\/r\/([a-z0-9]{6})\/?$/i);
  return match?.[1]?.toUpperCase() || '';
}

export default function App() {
  const socketRef = useRef<Socket | null>(null);
  const [state, setState] = useState<GameState | null>(null);
  const [name, setName] = useState('');
  const [roomCode, setRoomCode] = useState(inviteCodeFromPath);
  const [error, setError] = useState('');
  const [connected, setConnected] = useState(false);
  const [identityConfirmed, setIdentityConfirmed] = useState(false);
  const [showingResultDelay, setShowingResultDelay] = useState(false);
  const [copiedRoomCode, setCopiedRoomCode] = useState(false);
  const [copiedInvite, setCopiedInvite] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [comfortSize, setComfortSize] = useState<ComfortSize>(() => {
    const stored = window.localStorage.getItem(COMFORT_KEY);
    return COMFORT_SIZES.includes(stored as ComfortSize) ? stored as ComfortSize : 'standard';
  });
  const inviteRoomCode = useMemo(inviteCodeFromPath, []);
  const countdown = useCountdown(state?.actionDeadline || null);

  useEffect(() => {
    const socket = io({ path: '/kings-corner/socket.io', reconnection: true, reconnectionAttempts: Infinity, reconnectionDelay: 800, reconnectionDelayMax: 5_000, timeout: 20_000 });
    socketRef.current = socket;
    socket.on('connect', () => {
      setConnected(true);
      try {
        const saved = window.localStorage.getItem(SESSION_KEY);
        if (saved) socket.emit('reconnect_room', JSON.parse(saved));
      } catch {
        window.localStorage.removeItem(SESSION_KEY);
      }
    });
    socket.on('disconnect', () => setConnected(false));
    socket.on('connect_error', () => setConnected(false));
    socket.on('state', setState);
    socket.on('error_message', setError);
    socket.on('session_invalid', () => {
      window.localStorage.removeItem(SESSION_KEY);
      setIdentityConfirmed(false);
    });
    socket.on('session', (session) => {
      window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
      setName(session.name);
      setRoomCode(session.roomCode);
      setIdentityConfirmed(true);
      if (inviteCodeFromPath()) window.history.replaceState({}, '', import.meta.env.BASE_URL);
    });
    return () => { socket.disconnect(); };
  }, []);

  useEffect(() => {
    if (!state?.finished) {
      setShowingResultDelay(false);
      return undefined;
    }
    setShowingResultDelay(true);
    const timer = window.setTimeout(() => setShowingResultDelay(false), 1600);
    return () => window.clearTimeout(timer);
  }, [state?.finished]);

  useEffect(() => {
    document.documentElement.dataset.comfortSize = comfortSize;
    window.localStorage.setItem(COMFORT_KEY, comfortSize);
  }, [comfortSize]);

  const createRoom = () => {
    setError('');
    socketRef.current?.emit('create_room', { name });
  };
  const joinRoom = () => {
    setError('');
    socketRef.current?.emit('join_room', { name, roomCode });
  };
  const confirmIdentity = () => {
    if (!name.trim()) return;
    setIdentityConfirmed(true);
    if (inviteRoomCode && connected) {
      setRoomCode(inviteRoomCode);
      setError('');
      socketRef.current?.emit('join_room', { name, roomCode: inviteRoomCode });
    }
  };
  const nextComfortSize = () => {
    const index = COMFORT_SIZES.indexOf(comfortSize);
    setComfortSize(COMFORT_SIZES[(index + 1) % COMFORT_SIZES.length]);
  };
  const copyText = async (text: string, kind: 'code' | 'invite') => {
    try {
      await navigator.clipboard.writeText(text);
      if (kind === 'code') setCopiedRoomCode(true);
      else setCopiedInvite(true);
      window.setTimeout(() => kind === 'code' ? setCopiedRoomCode(false) : setCopiedInvite(false), 1600);
    } catch {
      setError('Copy failed — select the text instead.');
    }
  };
  const playCard = (action: PlayCardAction) => socketRef.current?.emit('play_card', action);
  const movePile = (action: MovePileAction) => socketRef.current?.emit('move_pile', action);
  const returnToLobby = () => {
    socketRef.current?.emit('leave_room');
    window.localStorage.removeItem(SESSION_KEY);
    setState(null);
    setRoomCode('');
    setError('');
    setIdentityConfirmed(true);
  };
  const returnToGameDesk = (): Promise<void> => {
    const socket = socketRef.current;
    if (!socket) return Promise.resolve();

    return new Promise((resolve) => {
      let settled = false;
      let timeoutId = 0;
      const finish = () => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeoutId);
        socket.off('connect', leave);
        window.localStorage.removeItem(SESSION_KEY);
        resolve();
      };
      const leave = () => socket.emit('leave_room', finish);
      timeoutId = window.setTimeout(finish, 1800);
      if (socket.connected) leave();
      else {
        socket.once('connect', leave);
        socket.connect();
      }
    });
  };

  const playableCards = useMemo(() => {
    const map = new Map<string, PlayCardAction>();
    state?.handActions.forEach((action) => {
      const key = `${action.card.rank}:${action.card.suit}`;
      if (!map.has(key)) map.set(key, action);
    });
    state?.suggestedActions.forEach((action) => {
      if (action.type === 'play_card') map.set(`${action.card.rank}:${action.card.suit}`, action);
    });
    return map;
  }, [state?.handActions, state?.suggestedActions]);

  const recommendedCardKey = useMemo(() => {
    const action = state?.suggestedActions.find((item): item is PlayCardAction => item.type === 'play_card');
    return action ? `${action.card.rank}:${action.card.suit}` : null;
  }, [state?.suggestedActions]);

  const automaticAction = typeof state?.lastAction?.type === 'string' && state.lastAction.type.startsWith('auto_');
  const connectionBanner = !connected ? <div className="connection-banner" role="status"><span /> Reconnecting… Your table is safe.</div> : null;

  if (!state) {
    if (!identityConfirmed) {
      return (<>
        <main className="shell welcome-screen">
          <section className="welcome-card">
            <GameDeskLink className="welcome-game-desk" />
            <div className="brand-lockup">
              <div className="brand-mark" aria-hidden="true"><span>K</span><i>♛</i></div>
              <div><h1>King’s Corner</h1><p className="eyebrow">The classic table game</p></div>
            </div>
            <label htmlFor="player-name">{inviteRoomCode ? `You’re invited to room ${inviteRoomCode}` : 'Play with your friends and family'}</label>
            <div className="identity-entry">
              <input
                id="player-name"
                value={name}
                maxLength={20}
                autoComplete="name"
                onChange={(event) => { setName(event.target.value); setError(''); }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && name.trim()) confirmIdentity();
                }}
                placeholder="Enter your name"
              />
              <button aria-label={inviteRoomCode ? 'Join invited table' : 'Continue'} onClick={confirmIdentity} disabled={!name.trim() || (Boolean(inviteRoomCode) && !connected)}>→</button>
            </div>
            <div className="field-message">Up to 20 characters</div>
            <button className="welcome-how-to" onClick={() => setShowHelp(true)}><strong>New to King’s Corner?</strong><span>See the rules and an animated example · about 2 minutes</span></button>
            <p className="welcome-rule-summary">Clear your hand by building downward in alternating colours. Kings open the four corner piles.</p>
            <div className="welcome-meta"><span>2–4 players</span><span>Private rooms</span><span>No sign-up</span></div>
            {connectionBanner}
          </section>
        </main>
        <HelpModal open={showHelp} onClose={() => setShowHelp(false)} comfortSize={comfortSize} onComfortSizeChange={setComfortSize} />
      </>
      );
    }

    return (<>
      <main className="shell menu-screen">
        <section className="menu-shell">
          <header className="menu-header">
            <GameDeskLink />
            <div className="header-actions"><button className="how-to-button" onClick={() => setShowHelp(true)}>How to play</button><button className="change-name" onClick={() => setIdentityConfirmed(false)}>Change name</button></div>
          </header>
          <div className="menu-hero">
            <p className="eyebrow game-lobby-label"><b aria-hidden="true">K♛</b> King’s Corner table</p>
            <LobbyGreeting name={name} />
            <p>Choose one: host a new table, or join using a code someone sent you.</p>
          </div>
          <div className="menu-grid">
            <button className="action-card create-card" onClick={createRoom} disabled={!connected}>
              <span className="action-icon">＋</span>
              <span><strong>Host a new table</strong><small>Choose this to create a fresh invite code</small></span>
              <b>→</b>
            </button>
            <section className="action-card join-card">
              <span className="action-icon">⌁</span>
              <span><strong>I have an invite code</strong><small>Use the six characters your host sent you</small></span>
              <div className="code-entry">
                <input
                  aria-label="Room code"
                  value={roomCode}
                  maxLength={6}
                  autoComplete="off"
                  onChange={(event) => setRoomCode(event.target.value.toUpperCase())}
                  onKeyDown={(event) => { if (event.key === 'Enter' && roomCode.length === 6) joinRoom(); }}
                  placeholder="ENTER CODE"
                />
                <button onClick={joinRoom} disabled={!connected || roomCode.length !== 6}>Join table</button>
              </div>
            </section>
          </div>
          {error && <p role="alert" className="error">{error}</p>}
        </section>
      </main>
      <HelpModal open={showHelp} onClose={() => setShowHelp(false)} comfortSize={comfortSize} onComfortSizeChange={setComfortSize} onReturnToGameDesk={returnToGameDesk} />
      {connectionBanner}
    </>);
  }

  if (!state.started) {
    const isHost = state.players[0]?.name === name;
    const inviteLink = `${window.location.origin}${import.meta.env.BASE_URL}r/${state.roomCode}`;
    return (<>
      <main className="shell waiting-screen">
        <section className="waiting-shell">
          <header className="menu-header">
            <GameDeskLink onBeforeNavigate={returnToGameDesk} />
            <div className="header-actions"><button className="how-to-button" onClick={() => setShowHelp(true)}>How to play</button><button className="change-name danger" onClick={returnToLobby}>Leave room</button></div>
          </header>
          <div className="waiting-heading">
            <div><p className="eyebrow">Private table</p><h1>Waiting for players</h1></div>
            <p>{isHost ? 'Invite your people, then start whenever everyone is ready.' : 'The host will start the game when everyone is ready.'}</p>
          </div>
          <section className="invite-card">
            <div className="invite-copy"><span>Room code</span><strong>{state.roomCode}</strong></div>
            <div className="invite-actions">
              <button className="secondary-button" onClick={() => copyText(state.roomCode, 'code')}>{copiedRoomCode ? 'Code copied' : 'Copy code'}</button>
              <button className="primary-button" onClick={() => copyText(inviteLink, 'invite')}>{copiedInvite ? 'Link copied' : 'Share invite'}</button>
            </div>
            <div className="invite-link">{inviteLink}</div>
          </section>
          <section className="players-section">
            <div className="section-heading"><h2>Players</h2><span>{state.players.length} / 4</span></div>
            <div className="waiting-players">{state.players.map((player, index) => (
              <div className="waiting-player" key={player.name}>
                <span className="waiting-avatar">{player.name.slice(0, 1).toUpperCase()}</span>
                <div><strong>{player.name}{player.name === name && <small> You</small>}</strong><small>{index === 0 ? 'Host' : player.connected ? 'Ready at the table' : 'Away'}</small></div>
                {player.isDealer && <span className="waiting-dealer">Dealer</span>}
                <i className={player.connected ? 'connected' : ''} aria-label={player.connected ? 'Connected' : 'Disconnected'} />
              </div>
            ))}</div>
          </section>
          <div className="waiting-actions">
            {isHost ? <button className="result-primary" onClick={() => socketRef.current?.emit('start_game')} disabled={state.players.length < 2}>{state.players.length < 2 ? 'Waiting for one more player' : <>Start game <span>→</span></>}</button> : <div className="waiting-pulse"><span /> Waiting for the host</div>}
          </div>
          {error && <p role="alert" className="error">{error}</p>}
        </section>
      </main>
      <HelpModal open={showHelp} onClose={() => setShowHelp(false)} comfortSize={comfortSize} onComfortSizeChange={setComfortSize} onReturnToGameDesk={returnToGameDesk} />
      {connectionBanner}
    </>);
  }

  if (state.finished) {
    return <><ResultsScreen state={state} username={name} showingDelay={showingResultDelay} onRestart={() => socketRef.current?.emit('restart_game')} onReturnToLobby={returnToLobby} onReturnToGameDesk={returnToGameDesk} />{connectionBanner}</>;
  }

  return (<>
    <main className="game-shell">
      <header className="game-header">
        <div className="game-header-identity"><GameDeskLink onBeforeNavigate={returnToGameDesk} /><div><p className="eyebrow">Room {state.roomCode}</p><h2>King’s Corner</h2></div></div>
        <div className="game-header-actions"><button className="game-help-button" onClick={() => setShowHelp(true)} aria-label="How to play">?</button><button className="game-size-button" onClick={nextComfortSize} aria-label={`Change text size. Current size ${COMFORT_BUTTON_LABELS[comfortSize]}`}>{COMFORT_BUTTON_LABELS[comfortSize]}</button><button className="game-help-button game-leave-button" onClick={returnToLobby} aria-label="Leave room">×</button><div className={`turn-clock ${state.isMyTurn ? 'active' : ''}`}><span>{countdown}</span><div><strong>{state.isMyTurn ? 'Your turn' : state.currentPlayerName}</strong><small>{state.isMyTurn ? 'Auto move in seconds' : 'is playing'}</small></div></div></div>
      </header>
      {state.starterName && <div className="game-starter-note" role="status"><span aria-hidden="true">♛</span>{state.starterName} started this game</div>}
      {automaticAction && <div className="last-action" role="status"><span>✦</span> Automatic move <small>{String(state.lastAction?.playerName || '')}</small></div>}
      <aside className="players-strip">{state.players.map((player) => <div key={player.name} className={player.name === state.currentPlayerName ? 'current' : ''}><span>{player.name.slice(0, 1)}</span><strong>{player.name}</strong><small>{player.cardCount}</small>{player.isDealer && <i>D</i>}</div>)}</aside>
      <GameBoard state={state} onMovePile={movePile} />
      <section className="hand-area">
        <div className="hand-heading"><div><p className="eyebrow">Your hand</p><strong>{state.myHand.length} cards</strong></div>{state.isMyTurn && <button className={`finish-turn ${state.handActions.length === 0 && state.pileActions.length === 0 ? 'ready' : ''}`} onClick={() => socketRef.current?.emit('end_turn')}>{state.handActions.length === 0 && state.pileActions.length === 0 ? 'No moves left · Finish turn' : 'Finish turn'} <span>→</span></button>}</div>
        <div className="hand-cards">{state.myHand.map((card: Card) => {
          const key = `${card.rank}:${card.suit}`;
          const action = playableCards.get(key);
          const recommended = recommendedCardKey === key;
          return <span className={`hand-card-wrap ${recommended ? 'recommended' : ''}`} key={`${card.rank}-${card.suit}`}>{recommended && <span className="best-move-arrow" aria-hidden="true">↓</span>}<CardView card={card} className={`${action ? 'playable' : ''} ${recommended ? 'suggested' : ''}`} onClick={action ? () => playCard(action) : undefined} label={action ? `Play ${card.rank} of ${card.suit}` : undefined} /></span>;
        })}</div>
        {state.isMyTurn && <p className={`action-note ${state.handActions.length === 0 && state.pileActions.length === 0 ? 'ready' : ''}`}>{state.handActions.length === 0 && state.pileActions.length === 0 ? 'You’re done here — finish your turn.' : 'The arrow marks a helpful move. Other playable cards and piles remain tappable.'}</p>}
      </section>
    </main>
    <HelpModal open={showHelp} onClose={() => setShowHelp(false)} comfortSize={comfortSize} onComfortSizeChange={setComfortSize} onReturnToGameDesk={returnToGameDesk} />
    {connectionBanner}
  </>);
}
