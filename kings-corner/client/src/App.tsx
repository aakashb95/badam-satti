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
    socket.on('session_invalid', () => window.localStorage.removeItem(SESSION_KEY));
    socket.on('session', (session) => {
      window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
      setName(session.name);
      setRoomCode(session.roomCode);
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
    return (
      <main className="shell landing">
        <div className="brand-mark" aria-hidden="true"><span>K</span><i>♛</i></div>
        <p className="eyebrow">A classic table game</p>
        <h1>King’s<br /><em>Corner</em></h1>
        <p className="intro">Build downward. Alternate colours. Make room for the kings.</p>
        <section className="join-panel">
          <label>Your name<input value={name} maxLength={20} onChange={(event) => setName(event.target.value)} placeholder="Aakash" /></label>
          <div className="join-row">
            <label>Room code<input value={roomCode} maxLength={6} onChange={(event) => setRoomCode(event.target.value.toUpperCase())} placeholder="ABC123" /></label>
            <button className="secondary" onClick={joinRoom} disabled={!connected || !name.trim() || roomCode.length !== 6}>Join</button>
          </div>
          <div className="or"><span>or</span></div>
          <button className="primary" onClick={createRoom} disabled={!connected || !name.trim()}>Create a new table</button>
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
        <div className="hand-heading"><div><p className="eyebrow">Your hand</p><strong>{state.myHand.length} cards</strong></div>{state.isMyTurn && <button className="finish-turn" onClick={() => socketRef.current?.emit('end_turn')}>Finish turn <span>→</span></button>}</div>
        <div className="hand-cards">{state.myHand.map((card: Card, index) => {
          const suggestion = cardSuggestion.get(`${card.rank}:${card.suit}`);
          return <CardView key={`${card.rank}-${card.suit}`} card={card} className={suggestion ? 'suggested' : ''} onClick={suggestion ? () => playCard(suggestion) : undefined} label={suggestion ? `Play suggested ${card.rank} of ${card.suit}` : undefined} />;
        })}</div>
        {state.isMyTurn && <p className="action-note">Glowing cards and piles are suggested moves. Tap one to play it instantly.</p>}
      </section>
    </main>
  );
}
