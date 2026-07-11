import React, { useEffect, useRef, useState } from 'react';
import { BrowserRouter, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import { io, Socket } from 'socket.io-client';
import './App.css';
import ErrorModal from './components/ErrorModal';
import GameOverScreen from './components/GameOverScreen';
import GameScreen from './components/GameScreen';
import JoinRoomScreen from './components/JoinRoomScreen';
import LoadingScreen from './components/LoadingScreen';
import LoginScreen from './components/LoginScreen';
import MenuScreen from './components/MenuScreen';
import Notification from './components/Notification';
import SimulationScreen from './components/SimulationScreen';
import SummaryScreen from './components/SummaryScreen';
import WaitingRoom from './components/WaitingRoom';
import { AppState, Card, ComfortSize, GameSummary, Winner } from './types';

interface JoinRequest {
  roomCode: string;
  username: string;
}

interface RouteState {
  error?: string;
  username?: string;
  joinRoom?: JoinRequest;
}

interface ServerErrorPayload {
  code?: string;
  message?: string;
}

const initialState: AppState = {
  currentScreen: 'login',
  username: '',
  currentRoom: '',
  gameState: null,
  myCards: [],
  validMoves: [],
  canPass: false,
  isMyTurn: false,
  error: null,
  notification: null,
  loading: null,
  winner: null,
  summary: null,
};

const rankLabel = (rank: number) => ({ 1: 'A', 11: 'J', 12: 'Q', 13: 'K' }[rank] || rank.toString());
const suitLabel = (suit: string) => ({ hearts: 'Hearts', diamonds: 'Diamonds', clubs: 'Clubs', spades: 'Spades' }[suit] || suit);

const COMFORT_SIZE_STORAGE_KEY = 'badam-satti-comfort-size';
const COMFORT_SIZES: ComfortSize[] = ['standard', 'large', 'extra-large'];

function getServerErrorMessage(message: string | Error | ServerErrorPayload): string {
  if (typeof message === 'object' && !(message instanceof Error)) {
    if (message.code === 'ROOM_NOT_FOUND') return 'Room code is wrong.';
    if (message.code === 'ROOM_FULL') return 'This room is full.';
    if (message.code === 'GAME_ALREADY_STARTED') return 'This game has already started.';
    if (message.code === 'INVALID_JOIN_DETAILS') return 'Enter a valid room code.';
    if (message.code === 'USERNAME_TAKEN') return 'That name is already taken in this room.';
  }

  const rawMessage = typeof message === 'string' ? message : message.message || 'Unexpected server error';
  const normalized = rawMessage.toLowerCase();

  if (normalized.includes('room not found')) return 'Room code is wrong.';
  if (normalized.includes('room is full')) return 'This room is full.';
  if (normalized.includes('game already started')) return 'This game has already started.';
  if (normalized.includes('invalid room code')) return 'Enter a valid room code.';
  if (normalized.includes('username already taken')) return 'That name is already taken in this room.';

  return rawMessage;
}

const getInitialComfortSize = (): ComfortSize => {
  try {
    const stored = window.localStorage.getItem(COMFORT_SIZE_STORAGE_KEY) as ComfortSize | null;
    return stored && COMFORT_SIZES.includes(stored) ? stored : 'standard';
  } catch {
    return 'standard';
  }
};

const App: React.FC = () => {
  const [comfortSize, setComfortSize] = useState<ComfortSize>(getInitialComfortSize);

  useEffect(() => {
    document.documentElement.dataset.comfortSize = comfortSize;
    try {
      window.localStorage.setItem(COMFORT_SIZE_STORAGE_KEY, comfortSize);
    } catch {
      // Ignore storage failures; the visible size still changes for the session.
    }
  }, [comfortSize]);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/r/:roomCode" element={<JoinRoomRoute />} />
        <Route path="/simulation" element={<SimulationRoute />} />
        <Route path="/*" element={<MainApp comfortSize={comfortSize} onComfortSizeChange={setComfortSize} />} />
      </Routes>
    </BrowserRouter>
  );
};

const JoinRoomRoute: React.FC = () => {
  const { roomCode } = useParams<{ roomCode: string }>();
  const navigate = useNavigate();
  const routeState = useLocation().state as RouteState | null;

  if (!roomCode) return <div>Invalid room code</div>;

  return (
    <div className="app">
      <JoinRoomScreen
        roomCode={roomCode.toUpperCase()}
        onJoinRoom={(code, username) => navigate('/', { state: { joinRoom: { roomCode: code, username } } })}
        onBackToMenu={() => navigate('/')}
        error={routeState?.error || null}
        initialUsername={routeState?.username || ''}
        onClearError={() => navigate(`/r/${roomCode}`, { replace: true })}
      />
    </div>
  );
};

const SimulationRoute: React.FC = () => (
  <div className="app">
    <SimulationScreen />
  </div>
);

interface MainAppProps {
  comfortSize: ComfortSize;
  onComfortSizeChange: (size: ComfortSize) => void;
}

const MainApp: React.FC<MainAppProps> = ({ comfortSize, onComfortSizeChange }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [appState, setAppState] = useState<AppState>(initialState);
  const [isConnected, setIsConnected] = useState(false);
  const [showingGameOverDelay, setShowingGameOverDelay] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const stateRef = useRef(appState);
  const joinRequestRef = useRef<JoinRequest | null>(null);
  const autoPlayTimer = useRef<number | null>(null);
  const actionPendingRef = useRef(false);
  const notificationTimer = useRef<number | null>(null);
  const resultTimer = useRef<number | null>(null);

  useEffect(() => {
    stateRef.current = appState;
  }, [appState]);

  function clearAutoPlay() {
    if (autoPlayTimer.current !== null) {
      window.clearTimeout(autoPlayTimer.current);
      autoPlayTimer.current = null;
    }
  }

  function notify(message: string) {
    if (notificationTimer.current !== null) window.clearTimeout(notificationTimer.current);
    setAppState((previous) => ({ ...previous, notification: message }));
    notificationTimer.current = window.setTimeout(() => {
      setAppState((previous) => ({ ...previous, notification: null }));
    }, 2600);
  }

  function showError(message: string) {
    setAppState((previous) => ({ ...previous, error: message, loading: null }));
  }

  function showLoading(message: string) {
    setAppState((previous) => ({ ...previous, loading: message, currentScreen: 'loading' }));
  }

  useEffect(() => {
    const socket = io({
      reconnection: true,
      reconnectionDelay: 800,
      reconnectionDelayMax: 4000,
      reconnectionAttempts: 10,
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      setIsConnected(true);
      setAppState((previous) => ({ ...previous, loading: null }));
      const current = stateRef.current;
      if (current.currentRoom && current.username) {
        socket.emit('reconnect_to_room', { roomCode: current.currentRoom, username: current.username });
      }
    });

    socket.on('disconnect', (reason) => {
      actionPendingRef.current = false;
      setIsConnected(false);
      if (reason === 'io server disconnect') socket.connect();
    });

    socket.on('connect_error', () => setIsConnected(false));
    socket.io.on('reconnect_failed', () => showError('Connection lost. Refresh the page to reconnect.'));

    socket.on('room_created', ({ roomCode, gameState }) => {
      setAppState((previous) => ({ ...previous, currentRoom: roomCode, gameState, currentScreen: 'waiting', loading: null }));
    });

    socket.on('room_joined', ({ roomCode, gameState }) => {
      joinRequestRef.current = null;
      setAppState((previous) => ({ ...previous, currentRoom: roomCode, gameState, currentScreen: 'waiting', loading: null }));
    });

    socket.on('player_joined', ({ playerName, gameState }) => {
      setAppState((previous) => ({ ...previous, gameState }));
      notify(`${playerName} joined the room`);
    });

    socket.on('player_disconnected', ({ playerName, gameState }) => {
      setAppState((previous) => ({ ...previous, gameState }));
      notify(`${playerName} disconnected`);
    });

    socket.on('player_temporarily_disconnected', ({ gameState }) => {
      setAppState((previous) => ({ ...previous, gameState }));
    });

    socket.on('player_reconnected', ({ gameState }) => {
      setAppState((previous) => ({ ...previous, gameState }));
    });

    socket.on('room_reconnected', ({ roomCode, gameState, myCards, validMoves, canPass }) => {
      setAppState((previous) => ({
        ...previous,
        currentRoom: roomCode,
        gameState,
        myCards: myCards || previous.myCards,
        validMoves: validMoves || previous.validMoves,
        canPass: Boolean(canPass),
        currentScreen: gameState?.started ? 'game' : 'waiting',
        loading: null,
      }));
    });

    socket.on('game_started', ({ gameState }) => {
      actionPendingRef.current = false;
      setAppState((previous) => ({ ...previous, gameState, currentScreen: 'game', loading: null }));
    });

    socket.on('your_cards', ({ cards, validMoves }) => {
      actionPendingRef.current = false;
      setAppState((previous) => ({ ...previous, myCards: cards, validMoves, canPass: validMoves.length === 0 }));
    });

    socket.on('card_played', ({ playerName, card, gameState }) => {
      actionPendingRef.current = false;
      setAppState((previous) => ({ ...previous, gameState }));
      notify(`${playerName} played ${rankLabel(card.rank)} of ${suitLabel(card.suit)}`);
    });

    socket.on('turn_passed', ({ playerName, gameState }) => {
      actionPendingRef.current = false;
      setAppState((previous) => ({ ...previous, gameState }));
      notify(`${playerName} passed`);
    });

    socket.on('game_over', (winner: Winner) => {
      actionPendingRef.current = false;
      clearAutoPlay();
      setShowingGameOverDelay(true);
      setAppState((previous) => ({ ...previous, currentScreen: 'game-over', winner }));
      if (resultTimer.current !== null) window.clearTimeout(resultTimer.current);
      resultTimer.current = window.setTimeout(() => setShowingGameOverDelay(false), 1200);
    });

    socket.on('cards_redistributed', ({ message }) => notify(message));

    socket.on('round_continued', ({ gameState }) => {
      actionPendingRef.current = false;
      setAppState((previous) => ({ ...previous, gameState, currentScreen: 'game', loading: null }));
    });

    socket.on('game_totals', (summary: GameSummary) => {
      setAppState((previous) => ({ ...previous, currentScreen: 'summary', loading: null, summary }));
    });

    socket.on('left_room', () => {
      actionPendingRef.current = false;
    });

    socket.on('game_state', (playerState) => {
      if (!playerState) return;
      const gameState = playerState.gameState || playerState;
      setAppState((previous) => ({
        ...previous,
        gameState,
        myCards: playerState.myCards || [],
        validMoves: playerState.validMoves || [],
        canPass: Boolean(playerState.canPass),
        currentScreen: gameState?.started ? 'game' : 'waiting',
      }));
    });

    socket.on('error', (message: string | Error) => {
      actionPendingRef.current = false;
      const errorMessage = getServerErrorMessage(message);
      if (errorMessage === 'Invalid move' || errorMessage.startsWith('Cannot pass')) {
        socket.emit('get_state');
        return;
      }
      const joinError = ['room code is wrong', 'room is full', 'game has already started'].some((text) => errorMessage.toLowerCase().includes(text));
      if (joinError && joinRequestRef.current) {
        const { roomCode, username } = joinRequestRef.current;
        navigate(`/r/${roomCode}`, { state: { error: errorMessage, username }, replace: true });
      } else if (joinError) {
        setAppState((previous) => ({ ...previous, currentScreen: 'menu', loading: null, error: errorMessage, currentRoom: '', gameState: null }));
      } else {
        showError(errorMessage);
      }
    });

    const syncCurrentRoom = () => {
      const current = stateRef.current;
      if (!current.currentRoom) return;

      if (socket.connected) {
        socket.emit('get_state');
        return;
      }

      if (current.username) {
        socket.once('connect', () => socket.emit('reconnect_to_room', { roomCode: current.currentRoom, username: current.username }));
      }

      socket.connect();
    };

    const syncWhenVisible = () => {
      if (document.visibilityState === 'visible') syncCurrentRoom();
    };

    document.addEventListener('visibilitychange', syncWhenVisible);
    window.addEventListener('focus', syncCurrentRoom);
    window.addEventListener('online', syncCurrentRoom);
    window.addEventListener('pageshow', syncCurrentRoom);

    return () => {
      document.removeEventListener('visibilitychange', syncWhenVisible);
      window.removeEventListener('focus', syncCurrentRoom);
      window.removeEventListener('online', syncCurrentRoom);
      window.removeEventListener('pageshow', syncCurrentRoom);
      clearAutoPlay();
      if (notificationTimer.current !== null) window.clearTimeout(notificationTimer.current);
      if (resultTimer.current !== null) window.clearTimeout(resultTimer.current);
      socket.close();
      socketRef.current = null;
    };
  }, [navigate]);

  useEffect(() => {
    const request = (location.state as RouteState | null)?.joinRoom;
    if (!request || !isConnected || !socketRef.current) return;
    joinRequestRef.current = request;
    setAppState((previous) => ({ ...previous, username: request.username, currentScreen: 'loading', loading: 'Joining room…' }));
    navigate('/', { replace: true });
    socketRef.current.emit('join_room', { roomCode: request.roomCode.toUpperCase(), username: request.username });
  }, [isConnected, location.state, navigate]);

  useEffect(() => {
    clearAutoPlay();
    if (!appState.gameState || !appState.isMyTurn || appState.currentScreen !== 'game') return;

    autoPlayTimer.current = window.setTimeout(() => {
      const current = stateRef.current;
      if (actionPendingRef.current || !current.isMyTurn || current.gameState?.currentPlayerName !== current.username || current.currentScreen !== 'game') return;

      const move = current.validMoves[Math.floor(Math.random() * current.validMoves.length)];
      if (move) {
        actionPendingRef.current = true;
        notify('Time’s up — playing a card');
        socketRef.current?.emit('play_card', move);
      } else if (current.canPass) {
        actionPendingRef.current = true;
        notify('Time’s up — passing');
        socketRef.current?.emit('pass_turn');
      }
    }, 20000);

    return clearAutoPlay;
  }, [appState.currentScreen, appState.gameState?.currentPlayerName, appState.isMyTurn]);

  useEffect(() => {
    const isMyTurn = appState.gameState?.currentPlayerName === appState.username;
    if (isMyTurn !== appState.isMyTurn) setAppState((previous) => ({ ...previous, isMyTurn }));
  }, [appState.gameState?.currentPlayerName, appState.isMyTurn, appState.username]);

  function requireConnection() {
    if (socketRef.current && isConnected) return socketRef.current;
    showError('Not connected to the server yet.');
    return null;
  }

  function createRoom() {
    const socket = requireConnection();
    if (!socket || !appState.username) return;
    showLoading('Creating room…');
    socket.emit('create_room', appState.username);
  }

  function joinRoom(roomCode: string, username = appState.username) {
    const socket = requireConnection();
    if (!socket || !username) return;
    if (roomCode.length !== 6) return showError('Enter a valid six-character room code.');
    showLoading('Joining room…');
    socket.emit('join_room', { roomCode: roomCode.toUpperCase(), username });
  }

  function startGame() {
    const count = appState.gameState?.players.length || 0;
    if (count < 2 || count > 11) return showError('A game needs between 2 and 11 players.');
    showLoading('Starting game…');
    socketRef.current?.emit('start_game');
  }

  function playCard(card: Card) {
    if (actionPendingRef.current || appState.currentScreen !== 'game' || !appState.isMyTurn) return;
    if (!appState.validMoves.some((move) => move.suit === card.suit && move.rank === card.rank)) return;
    actionPendingRef.current = true;
    clearAutoPlay();
    socketRef.current?.emit('play_card', card);
  }

  function passTurn() {
    if (actionPendingRef.current || appState.currentScreen !== 'game' || !appState.isMyTurn || !appState.canPass) return;
    actionPendingRef.current = true;
    clearAutoPlay();
    socketRef.current?.emit('pass_turn');
  }

  function leaveRoom() {
    actionPendingRef.current = false;
    clearAutoPlay();
    if (appState.currentRoom && socketRef.current?.connected) {
      socketRef.current.emit('leave_room');
    }
    setAppState((previous) => ({
      ...previous,
      currentRoom: '',
      gameState: null,
      myCards: [],
      validMoves: [],
      canPass: false,
      isMyTurn: false,
      currentScreen: 'menu',
      winner: null,
      summary: null,
    }));
  }

  function renderScreen() {
    switch (appState.currentScreen) {
      case 'login':
        return <LoginScreen onContinue={(username) => setAppState((previous) => ({ ...previous, username, currentScreen: 'menu' }))} />;
      case 'menu':
        return <MenuScreen username={appState.username} onCreateRoom={createRoom} onJoinRoom={joinRoom} comfortSize={comfortSize} onComfortSizeChange={onComfortSizeChange} />;
      case 'waiting':
        return <WaitingRoom roomCode={appState.currentRoom} gameState={appState.gameState} username={appState.username} onStartGame={startGame} onLeaveRoom={leaveRoom} onShowNotification={notify} />;
      case 'game':
        return <GameScreen gameState={appState.gameState} myCards={appState.myCards} validMoves={appState.validMoves} isMyTurn={appState.isMyTurn} canPass={appState.canPass} username={appState.username} onPlayCard={playCard} onPassTurn={passTurn} onLeaveGame={leaveRoom} comfortSize={comfortSize} onComfortSizeChange={onComfortSizeChange} />;
      case 'game-over':
        return <GameOverScreen winner={appState.winner} onContinueRound={() => { showLoading('Starting next round…'); socketRef.current?.emit('continue_round'); }} onExitGame={() => { showLoading('Calculating results…'); socketRef.current?.emit('exit_game'); }} showingDelay={showingGameOverDelay} canContinueRound={Boolean(appState.gameState && appState.gameState.round < appState.gameState.maxRounds)} />;
      case 'summary':
        return <SummaryScreen summary={appState.summary} username={appState.username} onReturnToMenu={leaveRoom} />;
      case 'loading':
        return <LoadingScreen message={appState.loading || 'Loading…'} />;
    }
  }

  return (
    <div className="app" data-comfort-size={comfortSize}>
      {renderScreen()}
      {appState.error && <ErrorModal message={appState.error} onClose={() => setAppState((previous) => ({ ...previous, error: null }))} />}
      {appState.notification && <Notification message={appState.notification} />}
    </div>
  );
};

export default App;
