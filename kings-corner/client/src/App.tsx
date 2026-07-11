import { useEffect, useMemo, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import CardView from './CardView';
import GameBoard from './GameBoard';
import type { Card, GameState, MovePileAction, PlayCardAction } from './types';

const SESSION_KEY = 'kings-corner-session';

function useCountdown(deadline: number | null) {
  const [remaining, setRemaining] = useState(10);
  useEffect(() => {
    const update = () => setRemaining(deadline ? Math.max(0, Math.ceil((deadline - Date.now()) / 1000)) : 10);
    update();
    const timer = window.setInterval(update, 200);
    return () => window.clearInterval(timer);
  }, [deadline]);
  return remaining;
}

export default function App() {
  const socketRef = useRef<Socket | null>(null);
  const [state, setState] = useState<GameState | null>(null);
  const [name, setName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [error, setError] = useState('');
  const [connected, setConnected] = useState(false);
  const [identityConfirmed, setIdentityConfirmed] = useState(false);
  const countdown = useCountdown(state?.actionDeadline || null);

  useEffect(() => {
    const socket = io({ reconnectionAttempts: 10 });
    socketRef.current = socket;
    socket.on('connect', () => {
      setConnected(true);
      const saved = window.localStorage.getItem(SESSION_KEY);
      if (saved) socket.emit('reconnect_room', JSON.parse(saved));
    });
    socket.on('disconnect', () => setConnected(false));
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
    });
    return () => { socket.disconnect(); };
  }, []);

  const createRoom = () => {
    setError('');
    socketRef.current?.emit('create_room', { name });
  };
  const joinRoom = () => {
    setError('');
    socketRef.current?.emit('join_room', { name, roomCode });
  };
  const playCard = (action: PlayCardAction) => socketRef.current?.emit('play_card', action);
  const movePile = (action: MovePileAction) => socketRef.current?.emit('move_pile', action);

  const cardSuggestion = useMemo(() => {
    const map = new Map<string, PlayCardAction>();
    state?.suggestedActions.forEach((action) => {
      if (action.type === 'play_card') map.set(`${action.card.rank}:${action.card.suit}`, action);
    });
    return map;
  }, [state?.suggestedActions]);

  const automaticAction = typeof state?.lastAction?.type === 'string' && state.lastAction.type.startsWith('auto_');

  if (!state) {
    if (!identityConfirmed) {
      return (
        <main className="shell welcome-screen">
          <section className="welcome-card">
            <div className="brand-lockup">
              <div className="brand-mark" aria-hidden="true"><span>K</span><i>♛</i></div>
              <div><h1>King’s Corner</h1><p className="eyebrow">The classic table game</p></div>
            </div>
            <p className="welcome-intro">Build downward, alternate colours, and clear your hand before everyone else.</p>
            <label htmlFor="player-name">Play with your friends and family</label>
            <div className="identity-entry">
              <input
                id="player-name"
                value={name}
                maxLength={20}
                autoComplete="name"
                onChange={(event) => { setName(event.target.value); setError(''); }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && name.trim()) setIdentityConfirmed(true);
                }}
                placeholder="Enter your name"
              />
              <button aria-label="Continue" onClick={() => setIdentityConfirmed(Boolean(name.trim()))} disabled={!name.trim()}>→</button>
            </div>
            <div className="welcome-meta"><span>2–4 players</span><span>Private rooms</span><span>No sign-up</span></div>
            {!connected && <p className="status">Connecting to the table…</p>}
          </section>
        </main>
      );
    }

    return (
      <main className="shell menu-screen">
        <section className="menu-shell">
          <header className="menu-header">
            <div className="mini-brand"><span>K</span><strong>King’s Corner</strong></div>
            <button className="change-name" onClick={() => setIdentityConfirmed(false)}>Change name</button>
          </header>
          <div className="menu-hero">
            <p className="eyebrow">Welcome to the table</p>
            <h1>Good to see you,<br /><em>{name}</em>.</h1>
            <p>Start a private table or enter the six-character code from your host.</p>
          </div>
          <div className="menu-grid">
            <button className="action-card create-card" onClick={createRoom} disabled={!connected}>
              <span className="action-icon">＋</span>
              <span><strong>Create a table</strong><small>You host and invite everyone</small></span>
              <b>→</b>
            </button>
            <section className="action-card join-card">
              <span className="action-icon">⌁</span>
              <span><strong>Join a table</strong><small>Enter the code from your host</small></span>
              <div className="code-entry">
                <input
                  aria-label="Room code"
                  value={roomCode}
                  maxLength={6}
                  autoComplete="off"
                  onChange={(event) => setRoomCode(event.target.value.toUpperCase())}
                  onKeyDown={(event) => { if (event.key === 'Enter' && roomCode.length === 6) joinRoom(); }}
                  placeholder="ABC123"
                />
                <button onClick={joinRoom} disabled={!connected || roomCode.length !== 6}>Join</button>
              </div>
            </section>
          </div>
          {!connected && <p className="status">Connecting to the table…</p>}
          {error && <p role="alert" className="error">{error}</p>}
        </section>
      </main>
    );
  }

  if (!state.started) {
    const isHost = state.players[0]?.name === name;
    return (
      <main className="shell waiting">
        <p className="eyebrow">Private table</p>
        <h1>Room <em>{state.roomCode}</em></h1>
        <button className="copy-code" onClick={() => navigator.clipboard?.writeText(state.roomCode)}>Copy room code</button>
        <section className="seats">
          {state.players.map((player) => <div className="seat" key={player.name}><span>{player.name.slice(0, 1).toUpperCase()}</span><strong>{player.name}</strong>{player.isDealer && <small>HOST</small>}</div>)}
          {Array.from({ length: 4 - state.players.length }, (_, index) => <div className="seat empty-seat" key={index}><span>+</span><strong>Open seat</strong></div>)}
        </section>
        <p className="waiting-copy">Two to four players. Everyone begins with seven cards.</p>
        {isHost ? <button className="primary" onClick={() => socketRef.current?.emit('start_game')} disabled={state.players.length < 2}>Deal the cards</button> : <p className="status">Waiting for {state.players[0]?.name} to deal…</p>}
        {error && <p role="alert" className="error">{error}</p>}
      </main>
    );
  }

  if (state.finished) {
    const won = state.winnerName === name;
    return <main className="shell result"><div className="crown">♛</div><p className="eyebrow">The table is settled</p><h1>{won ? 'You rule the corner.' : `${state.winnerName} wins.`}</h1><p>{won ? 'Every card found its place.' : 'A clean hand takes the crown.'}</p></main>;
  }

  return (
    <main className="game-shell">
      <header className="game-header">
        <div><p className="eyebrow">Room {state.roomCode}</p><h2>King’s Corner</h2></div>
        <div className={`turn-clock ${state.isMyTurn ? 'active' : ''}`}><span>{countdown}</span><div><strong>{state.isMyTurn ? 'Your turn' : state.currentPlayerName}</strong><small>{state.isMyTurn ? 'Auto move in seconds' : 'is playing'}</small></div></div>
      </header>
      {automaticAction && <div className="last-action" role="status"><span>✦</span> Automatic move <small>{String(state.lastAction?.playerName || '')}</small></div>}
      <aside className="players-strip">{state.players.map((player) => <div key={player.name} className={player.name === state.currentPlayerName ? 'current' : ''}><span>{player.name.slice(0, 1)}</span><strong>{player.name}</strong><small>{player.cardCount}</small>{player.isDealer && <i>D</i>}</div>)}</aside>
      <GameBoard state={state} onMovePile={movePile} />
      <section className="hand-area">
        <div className="hand-heading"><div><p className="eyebrow">Your hand</p><strong>{state.myHand.length} cards</strong></div>{state.isMyTurn && <button className={`finish-turn ${state.suggestedActions.length === 0 ? 'ready' : ''}`} onClick={() => socketRef.current?.emit('end_turn')}>{state.suggestedActions.length === 0 ? 'No moves left · Finish turn' : 'Finish turn'} <span>→</span></button>}</div>
        <div className="hand-cards">{state.myHand.map((card: Card, index) => {
          const suggestion = cardSuggestion.get(`${card.rank}:${card.suit}`);
          return <CardView key={`${card.rank}-${card.suit}`} card={card} className={suggestion ? 'suggested' : ''} onClick={suggestion ? () => playCard(suggestion) : undefined} label={suggestion ? `Play suggested ${card.rank} of ${card.suit}` : undefined} />;
        })}</div>
        {state.isMyTurn && <p className={`action-note ${state.suggestedActions.length === 0 ? 'ready' : ''}`}>{state.suggestedActions.length === 0 ? 'You’re done here — finish your turn.' : 'Glowing cards and piles are suggested moves. Tap one to play it instantly.'}</p>}
      </section>
    </main>
  );
}
