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
import SummaryScreen from './components/SummaryScreen';
import ThemeToggle, { ThemeMode } from './components/ThemeToggle';
import WaitingRoom from './components/WaitingRoom';
import { AppState, Card, GameSummary, Winner } from './types';

interface JoinRequest {
  roomCode: string;
  username: string;
}

interface RouteState {
  error?: string;
  joinRoom?: JoinRequest;
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

const THEME_STORAGE_KEY = 'badam-satti-theme';

const getInitialTheme = (): ThemeMode => {
  try {
    return window.localStorage.getItem(THEME_STORAGE_KEY) === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
};

const App: React.FC = () => {
  const [theme, setTheme] = useState<ThemeMode>(getInitialTheme);
  const toggleTheme = () => setTheme((current) => (current === 'light' ? 'dark' : 'light'));

  useEffect(() => {
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Ignore storage failures; the visible theme still changes for the session.
    }
  }, [theme]);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/r/:roomCode" element={<JoinRoomRoute theme={theme} onToggleTheme={toggleTheme} />} />
        <Route path="/*" element={<MainApp theme={theme} onToggleTheme={toggleTheme} />} />
      </Routes>
    </BrowserRouter>
  );
};

interface ThemeProps {
  theme: ThemeMode;
  onToggleTheme: () => void;
}

const JoinRoomRoute: React.FC<ThemeProps> = ({ theme, onToggleTheme }) => {
  const { roomCode } = useParams<{ roomCode: string }>();
  const navigate = useNavigate();
  const routeState = useLocation().state as RouteState | null;

  if (!roomCode) return <div>Invalid room code</div>;

  return (
    <div className="app" data-theme={theme}>
      <JoinRoomScreen
        roomCode={roomCode.toUpperCase()}
        onJoinRoom={(code, username) => navigate('/', { state: { joinRoom: { roomCode: code, username } } })}
        onBackToMenu={() => navigate('/')}
        error={routeState?.error || null}
        onClearError={() => navigate(`/r/${roomCode}`, { replace: true })}
        themeToggle={<ThemeToggle theme={theme} onToggle={onToggleTheme} />}
      />
    </div>
  );
};

const MainApp: React.FC<ThemeProps> = ({ theme, onToggleTheme }) => {
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
      if (stateRef.current.currentRoom) socket.emit('get_state');
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

    socket.on('player_temporarily_disconnected', ({ playerName, gameState }) => {
      setAppState((previous) => ({ ...previous, gameState }));
      notify(`${playerName} can still reconnect`);
    });

    socket.on('player_reconnected', ({ playerName, gameState }) => {
      setAppState((previous) => ({ ...previous, gameState }));
      notify(`${playerName} reconnected`);
    });

    socket.on('room_reconnected', ({ roomCode, gameState }) => {
      setAppState((previous) => ({
        ...previous,
        currentRoom: roomCode,
        gameState,
        currentScreen: gameState.started ? 'game' : 'waiting',
        loading: null,
      }));
      notify('Reconnected to the room');
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

    socket.on('game_state', (playerState) => {
      if (!playerState) return;
      setAppState((previous) => ({
        ...previous,
        gameState: playerState.gameState,
        myCards: playerState.myCards || [],
        validMoves: playerState.validMoves || [],
        canPass: Boolean(playerState.canPass),
        currentScreen: playerState.gameState?.started ? 'game' : 'waiting',
      }));
    });

    socket.on('error', (message: string | Error) => {
      actionPendingRef.current = false;
      const errorMessage = typeof message === 'string' ? message : message.message || 'Unexpected server error';
      if (errorMessage === 'Invalid move' || errorMessage.startsWith('Cannot pass')) {
        socket.emit('get_state');
        return;
      }
      const joinError = ['room not found', 'room is full', 'game already started'].some((text) => errorMessage.toLowerCase().includes(text));
      if (joinError && joinRequestRef.current) {
        const { roomCode } = joinRequestRef.current;
        navigate(`/r/${roomCode}`, { state: { error: errorMessage }, replace: true });
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

      if (current.currentScreen === 'waiting' && current.username) {
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

  function reconnectToRoom(roomCode: string) {
    const socket = requireConnection();
    if (!socket || !appState.username) return;
    if (roomCode.length !== 6) return showError('Enter a valid six-character room code.');
    showLoading('Reconnecting…');
    socket.emit('reconnect_to_room', { roomCode: roomCode.toUpperCase(), username: appState.username });
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
    socketRef.current?.disconnect().connect();
  }

  function renderScreen() {
    const themeToggle = <ThemeToggle theme={theme} onToggle={onToggleTheme} />;
    const compactThemeToggle = <ThemeToggle theme={theme} onToggle={onToggleTheme} compact />;

    switch (appState.currentScreen) {
      case 'login':
        return <LoginScreen onContinue={(username) => setAppState((previous) => ({ ...previous, username, currentScreen: 'menu' }))} themeToggle={themeToggle} />;
      case 'menu':
        return <MenuScreen username={appState.username} onCreateRoom={createRoom} onJoinRoom={joinRoom} onReconnectToRoom={reconnectToRoom} themeToggle={themeToggle} />;
      case 'waiting':
        return <WaitingRoom roomCode={appState.currentRoom} gameState={appState.gameState} username={appState.username} onStartGame={startGame} onLeaveRoom={leaveRoom} onShowNotification={notify} themeToggle={themeToggle} />;
      case 'game':
        return <GameScreen gameState={appState.gameState} myCards={appState.myCards} validMoves={appState.validMoves} isMyTurn={appState.isMyTurn} canPass={appState.canPass} username={appState.username} onPlayCard={playCard} onPassTurn={passTurn} onLeaveGame={leaveRoom} themeToggle={compactThemeToggle} />;
      case 'game-over':
        return <GameOverScreen winner={appState.winner} onContinueRound={() => { showLoading('Starting next round…'); socketRef.current?.emit('continue_round'); }} onExitGame={() => { showLoading('Calculating results…'); socketRef.current?.emit('exit_game'); }} showingDelay={showingGameOverDelay} />;
      case 'summary':
        return <SummaryScreen summary={appState.summary} onReturnToMenu={leaveRoom} />;
      case 'loading':
        return <LoadingScreen message={appState.loading || 'Loading…'} />;
    }
  }

  return (
    <div className="app" data-theme={theme}>
      {renderScreen()}
      {appState.error && <ErrorModal message={appState.error} onClose={() => setAppState((previous) => ({ ...previous, error: null }))} />}
      {appState.notification && <Notification message={appState.notification} />}
    </div>
  );
};

export default App;
