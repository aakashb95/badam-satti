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

interface RoomSession {
  roomCode: string;
  username: string;
}

const COMFORT_SIZE_STORAGE_KEY = 'badam-satti-comfort-size';
const ROOM_SESSION_STORAGE_KEY = 'badam-satti-room-session';
const COMFORT_SIZES: ComfortSize[] = ['standard', 'large', 'extra-large', 'maximum'];

const createEmptyAppState = (): AppState => ({
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
});


function loadRoomSession(): RoomSession | null {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(ROOM_SESSION_STORAGE_KEY) || 'null');
    if (
      parsed &&
      typeof parsed.username === 'string' &&
      parsed.username.trim().length > 0 &&
      typeof parsed.roomCode === 'string' &&
      /^[A-Z0-9]{6}$/.test(parsed.roomCode)
    ) {
      return { username: parsed.username, roomCode: parsed.roomCode };
    }
  } catch {
    // Invalid or unavailable storage should not prevent the app from opening.
  }
  return null;
}

function saveRoomSession(session: RoomSession) {
  try {
    window.localStorage.setItem(ROOM_SESSION_STORAGE_KEY, JSON.stringify(session));
  } catch {
    // The live in-memory session still works when storage is unavailable.
  }
}

function clearRoomSession() {
  try {
    window.localStorage.removeItem(ROOM_SESSION_STORAGE_KEY);
  } catch {
    // The live in-memory session can still be cleared.
  }
}

function getInitialAppState(): AppState {
  const session = loadRoomSession();
  if (!session) return createEmptyAppState();

  return {
    ...createEmptyAppState(),
    username: session.username,
    currentRoom: session.roomCode,
    currentScreen: 'loading',
    loading: 'Reconnecting to your room…',
  };
}

function getServerErrorMessage(message: string | Error | ServerErrorPayload): string {
  if (typeof message === 'object' && !(message instanceof Error)) {
    if (message.code === 'ROOM_NOT_FOUND') return 'Room code is wrong.';
    if (message.code === 'ROOM_FULL') return 'This room is full.';
    if (message.code === 'GAME_ALREADY_STARTED') return 'This game has already started.';
    if (message.code === 'INVALID_JOIN_DETAILS') return 'Enter a valid room code.';
    if (message.code === 'USERNAME_TAKEN') return 'That name is already taken in this room.';
    if (message.code === 'RECONNECT_UNAVAILABLE') return 'Your saved seat is no longer available.';
    if (message.code === 'RECONNECT_FAILED') return 'We could not restore your seat.';
    if (message.code === 'NOT_ENOUGH_CONNECTED_PLAYERS') return 'At least two connected players are needed to start.';
    if (message.code === 'PLAYERS_RECONNECTING') return 'Wait for disconnected players to reconnect before starting the next round.';
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
    <BrowserRouter basename={import.meta.env.BASE_URL}>
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
  const routeLocation = useLocation();
  const routeState = routeLocation.state as RouteState | null;

  if (!roomCode) return <div>Invalid room code</div>;

  return (
    <div className="app">
      <JoinRoomScreen
        roomCode={roomCode.toUpperCase()}
        onJoinRoom={(code, username) => navigate(`/${routeLocation.search}`, { state: { joinRoom: { roomCode: code, username } } })}
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
  const initialJoinRequest = (location.state as RouteState | null)?.joinRoom;
  const [appState, setAppState] = useState<AppState>(() => (
    initialJoinRequest
      ? {
          ...createEmptyAppState(),
          username: initialJoinRequest.username,
          currentScreen: 'loading',
          loading: 'Joining room…',
        }
      : getInitialAppState()
  ));
  const [isConnected, setIsConnected] = useState(false);
  const [showingGameOverDelay, setShowingGameOverDelay] = useState(false);
  const [recoverySession, setRecoverySession] = useState<RoomSession | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const stateRef = useRef(appState);
  const joinRequestRef = useRef<JoinRequest | null>(null);
  const reconnectPendingRef = useRef(false);
  const actionPendingRef = useRef(false);
  const notificationTimer = useRef<number | null>(null);
  const resultTimer = useRef<number | null>(null);
  const finalPlayTimer = useRef<number | null>(null);

  useEffect(() => {
    stateRef.current = appState;
  }, [appState]);

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
      path: '/socket.io',
      reconnection: true,
      reconnectionDelay: 800,
      reconnectionDelayMax: 4000,
      reconnectionAttempts: 10,
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      setIsConnected(true);
      const current = stateRef.current;
      if (current.currentRoom && current.username) {
        reconnectPendingRef.current = true;
        setAppState((previous) => ({
          ...previous,
          currentScreen: 'loading',
          loading: 'Reconnecting to your room…',
        }));
        socket.emit('reconnect_to_room', { roomCode: current.currentRoom, username: current.username });
      } else {
        setAppState((previous) => ({ ...previous, loading: null }));
      }
    });

    socket.on('disconnect', (reason) => {
      actionPendingRef.current = false;
      setIsConnected(false);
      if (reason === 'io server disconnect') socket.connect();
    });

    socket.on('connect_error', () => setIsConnected(false));
    socket.io.on('reconnect_failed', () => {
      const current = stateRef.current;
      if (current.currentRoom && current.username) {
        setRecoverySession({ roomCode: current.currentRoom, username: current.username });
      }
      showError('Connection lost. Reconnect when your network is available.');
    });

    socket.on('room_created', ({ roomCode, gameState }) => {
      saveRoomSession({ roomCode, username: stateRef.current.username });
      setRecoverySession(null);
      setAppState((previous) => ({ ...previous, currentRoom: roomCode, gameState, currentScreen: 'waiting', loading: null }));
    });

    socket.on('room_joined', ({ roomCode, gameState }) => {
      const username = joinRequestRef.current?.username || stateRef.current.username;
      joinRequestRef.current = null;
      saveRoomSession({ roomCode, username });
      setRecoverySession(null);
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
      reconnectPendingRef.current = false;
      const username = joinRequestRef.current?.username || stateRef.current.username;
      joinRequestRef.current = null;
      saveRoomSession({ roomCode, username });
      setRecoverySession(null);
      setAppState((previous) => ({
        ...previous,
        currentRoom: roomCode,
        gameState,
        myCards: myCards || previous.myCards,
        validMoves: validMoves || previous.validMoves,
        canPass: Boolean(canPass),
        currentScreen: gameState?.started ? 'game' : 'waiting',
        loading: null,
        error: null,
      }));
    });

    socket.on('game_started', ({ gameState }) => {
      actionPendingRef.current = false;
      setAppState((previous) => ({ ...previous, gameState, currentScreen: 'game', loading: null, winner: null }));
    });

    socket.on('your_cards', ({ cards, validMoves }) => {
      actionPendingRef.current = false;
      setAppState((previous) => ({ ...previous, myCards: cards, validMoves, canPass: validMoves.length === 0 }));
    });

    socket.on('card_played', ({ gameState }) => {
      actionPendingRef.current = false;
      setAppState((previous) => ({ ...previous, gameState }));
    });

    socket.on('turn_passed', ({ gameState }) => {
      actionPendingRef.current = false;
      setAppState((previous) => ({ ...previous, gameState }));
    });

    socket.on('game_over', (winner: Winner) => {
      actionPendingRef.current = false;
      setAppState((previous) => ({ ...previous, winner }));
      if (finalPlayTimer.current !== null) window.clearTimeout(finalPlayTimer.current);
      if (resultTimer.current !== null) window.clearTimeout(resultTimer.current);
      finalPlayTimer.current = window.setTimeout(() => {
        setShowingGameOverDelay(true);
        setAppState((previous) => ({ ...previous, currentScreen: 'game-over' }));
        resultTimer.current = window.setTimeout(() => setShowingGameOverDelay(false), 2200);
      }, 2500);
    });

    socket.on('cards_redistributed', ({ message }) => notify(message));

    socket.on('round_continued', ({ gameState }) => {
      actionPendingRef.current = false;
      setShowingGameOverDelay(false);
      setAppState((previous) => ({ ...previous, gameState, currentScreen: 'game', loading: null, winner: null }));
    });

    socket.on('turn_duration_changed', ({ gameState }) => {
      setAppState((previous) => ({ ...previous, gameState }));
    });

    socket.on('game_totals', (summary: GameSummary) => {
      clearRoomSession();
      setAppState((previous) => ({ ...previous, currentScreen: 'summary', loading: null, summary }));
    });

    socket.on('left_room', () => {
      actionPendingRef.current = false;
      reconnectPendingRef.current = false;
      clearRoomSession();
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

    socket.on('error', (message: string | Error | ServerErrorPayload) => {
      actionPendingRef.current = false;
      const errorMessage = getServerErrorMessage(message);
      if (reconnectPendingRef.current) {
        reconnectPendingRef.current = false;
        const errorCode = typeof message === 'object' && !(message instanceof Error) ? message.code : undefined;
        const current = stateRef.current;
        if (current.currentRoom && current.username) {
          setRecoverySession({ roomCode: current.currentRoom, username: current.username });
        }
        showError(
          errorCode === 'ROOM_NOT_FOUND' || errorCode === 'RECONNECT_UNAVAILABLE'
            ? 'Your saved seat is no longer available.'
            : errorMessage
        );
        return;
      }
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
      if (notificationTimer.current !== null) window.clearTimeout(notificationTimer.current);
      if (resultTimer.current !== null) window.clearTimeout(resultTimer.current);
      if (finalPlayTimer.current !== null) window.clearTimeout(finalPlayTimer.current);
      socket.close();
      socketRef.current = null;
    };
  }, [navigate]);

  useEffect(() => {
    const request = (location.state as RouteState | null)?.joinRoom;
    if (!request || !isConnected || !socketRef.current) return;
    clearRoomSession();
    joinRequestRef.current = request;
    setAppState((previous) => ({ ...previous, username: request.username, currentScreen: 'loading', loading: 'Joining room…' }));
    navigate('/', { replace: true });
    socketRef.current.emit('join_room', { roomCode: request.roomCode.toUpperCase(), username: request.username });
  }, [isConnected, location.state, navigate]);

  // Turn timing is server-authoritative: when a turn expires the server
  // plays or passes for the current player and broadcasts the result.
  // The client only renders the countdown.

  useEffect(() => {
    const isMyTurn = appState.gameState?.currentPlayerName === appState.username;
    if (isMyTurn !== appState.isMyTurn) setAppState((previous) => ({ ...previous, isMyTurn }));
  }, [appState.gameState?.currentPlayerName, appState.isMyTurn, appState.username]);

  function requireConnection() {
    if (socketRef.current && isConnected) return socketRef.current;
    showError('Not connected to the server yet.');
    return null;
  }

  function retryRoomRecovery() {
    const session = recoverySession;
    const socket = socketRef.current;
    if (!session || !socket) return;

    reconnectPendingRef.current = true;
    setRecoverySession(null);
    setAppState((previous) => ({
      ...previous,
      username: session.username,
      currentRoom: session.roomCode,
      currentScreen: 'loading',
      loading: 'Reconnecting to your room…',
      error: null,
    }));

    if (socket.connected) {
      socket.emit('reconnect_to_room', session);
    } else {
      socket.connect();
    }
  }

  function leaveRoomRecovery() {
    clearRoomSession();
    reconnectPendingRef.current = false;
    setRecoverySession(null);
    setAppState((previous) => ({
      ...createEmptyAppState(),
      username: previous.username,
      currentScreen: previous.username ? 'menu' : 'login',
    }));
    navigate('/', { replace: true });
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
    socketRef.current?.emit('play_card', card);
  }

  function passTurn() {
    if (actionPendingRef.current || appState.currentScreen !== 'game' || !appState.isMyTurn || !appState.canPass) return;
    actionPendingRef.current = true;
    socketRef.current?.emit('pass_turn');
  }

  function setTurnDuration(seconds: number) {
    socketRef.current?.emit('set_turn_duration', seconds);
  }

  function leaveRoom() {
    actionPendingRef.current = false;
    reconnectPendingRef.current = false;
    clearRoomSession();
    setRecoverySession(null);
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

  function leaveRoomForGameDesk(): Promise<void> {
    actionPendingRef.current = false;
    reconnectPendingRef.current = false;
    clearRoomSession();
    setRecoverySession(null);
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
  }

  function renderScreen() {
    switch (appState.currentScreen) {
      case 'login':
        return <LoginScreen onContinue={(username) => setAppState((previous) => ({ ...previous, username, currentScreen: 'menu' }))} comfortSize={comfortSize} onComfortSizeChange={onComfortSizeChange} />;
      case 'menu':
        return <MenuScreen username={appState.username} onCreateRoom={createRoom} onJoinRoom={joinRoom} comfortSize={comfortSize} onComfortSizeChange={onComfortSizeChange} />;
      case 'waiting':
        return <WaitingRoom roomCode={appState.currentRoom} gameState={appState.gameState} username={appState.username} onStartGame={startGame} onLeaveRoom={leaveRoom} onShowNotification={notify} onReturnToGameDesk={leaveRoomForGameDesk} onSetTurnDuration={setTurnDuration} />;
      case 'game':
        return <GameScreen gameState={appState.gameState} myCards={appState.myCards} validMoves={appState.validMoves} isMyTurn={appState.isMyTurn} canPass={appState.canPass} username={appState.username} onPlayCard={playCard} onPassTurn={passTurn} onLeaveGame={leaveRoom} comfortSize={comfortSize} onComfortSizeChange={onComfortSizeChange} onReturnToGameDesk={leaveRoomForGameDesk} roundWinnerName={appState.gameState?.gameFinished ? appState.winner?.winner : undefined} />;
      case 'game-over':
        return <GameOverScreen winner={appState.winner} onContinueRound={() => { showLoading('Starting next round…'); socketRef.current?.emit('continue_round'); }} onExitGame={() => { showLoading('Calculating results…'); socketRef.current?.emit('exit_game'); }} showingDelay={showingGameOverDelay} canContinueRound={Boolean(appState.gameState && appState.gameState.round < appState.gameState.maxRounds)} onReturnToGameDesk={leaveRoomForGameDesk} />;
      case 'summary':
        return <SummaryScreen summary={appState.summary} username={appState.username} onReturnToMenu={leaveRoom} onReturnToGameDesk={leaveRoomForGameDesk} />;
      case 'loading':
        return <LoadingScreen message={appState.loading || 'Loading…'} onReturnToGameDesk={leaveRoomForGameDesk} />;
    }
  }

  return (
    <div className="app" data-comfort-size={comfortSize}>
      {renderScreen()}
      {appState.error && (
        <ErrorModal
          message={appState.error}
          onClose={recoverySession ? retryRoomRecovery : () => setAppState((previous) => ({ ...previous, error: null }))}
          primaryLabel={recoverySession ? 'Reconnect to room' : undefined}
          secondaryLabel={recoverySession ? 'Leave room' : undefined}
          onSecondary={recoverySession ? leaveRoomRecovery : undefined}
        />
      )}
      {appState.notification && <Notification message={appState.notification} inGame={appState.currentScreen === 'game'} />}
    </div>
  );
};

export default App;
