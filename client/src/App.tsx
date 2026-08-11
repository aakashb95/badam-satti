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
import RoundStartScreen from './components/RoundStartScreen';
import SimulationScreen from './components/SimulationScreen';
import SummaryScreen from './components/SummaryScreen';
import WaitingRoom from './components/WaitingRoom';
import { endAbandonedGame } from './gameAbandonment';
import { getBackgroundMusicVolume, isBackgroundMusicEnabled, resumeBackgroundMusic, setBackgroundMusicEnabled, setBackgroundMusicVolume } from './music';
import { NEXT_ROUND_SPLASH_MS, SCORE_COUNTING_SPLASH_MS } from './roundTiming';
import { clearRoomSession, findSavedRoomSession, findSavedRoomSessionForRoom, loadMostRecentSavedRoomSession, loadTabRoomSession, saveRoomSession } from './roomSession';
import type { RoomSession } from './roomSession';
import { isSoundEnabled, playCardSound, playDealSound, playGameWinSound, playKnockSound, playRoundWinSound, setSoundEnabled, unlockAudio } from './sounds';
import { AppState, Card, ComfortSize, GameSummary, Player, Winner } from './types';

interface JoinRequest {
  roomCode: string;
  username: string;
  sessionToken?: string;
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

const COMFORT_SIZE_STORAGE_KEY = 'badam-satti-comfort-size';
const COMFORT_SIZES: ComfortSize[] = ['standard', 'large', 'extra-large', 'maximum'];

const createEmptyAppState = (): AppState => ({
  currentScreen: 'login',
  username: '',
  currentRoom: '',
  sessionToken: '',
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
  gameEndedByDepartures: false,
});

function getInitialAppState(): AppState {
  const session = loadTabRoomSession();
  if (!session) {
    const savedSession = loadMostRecentSavedRoomSession();
    return savedSession
      ? {
          ...createEmptyAppState(),
          username: savedSession.username,
          currentScreen: 'menu',
        }
      : createEmptyAppState();
  }

  return {
    ...createEmptyAppState(),
    username: session.username,
    currentRoom: session.roomCode,
    sessionToken: session.sessionToken,
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
    if (message.code === 'RECONNECT_REQUIRED') return 'This name has a reserved seat on another device.';
    if (message.code === 'NOT_ENOUGH_CONNECTED_PLAYERS') return 'Need at least 3 players to play.';
    if (message.code === 'PLAYERS_RECONNECTING') return 'Wait for disconnected players to reconnect. Need 3 connected players to continue.';
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

const screenForGameState = (gameState: AppState['gameState']): AppState['currentScreen'] => {
  if (gameState?.gameFinished) return 'game-over';
  if (gameState?.started) return 'game';
  return 'waiting';
};

const App: React.FC = () => {
  const [comfortSize, setComfortSize] = useState<ComfortSize>(getInitialComfortSize);
  const [soundOn, setSoundOn] = useState<boolean>(isSoundEnabled);
  const [backgroundMusicOn, setBackgroundMusicOn] = useState<boolean>(isBackgroundMusicEnabled);
  const [backgroundMusicVolume, setBackgroundMusicVolumeState] = useState<number>(getBackgroundMusicVolume);

  useEffect(() => {
    document.documentElement.dataset.comfortSize = comfortSize;
    try {
      window.localStorage.setItem(COMFORT_SIZE_STORAGE_KEY, comfortSize);
    } catch {
      // Ignore storage failures; the visible size still changes for the session.
    }
  }, [comfortSize]);

  // Browsers only let audio start from a user gesture, so the first tap or key
  // press anywhere opens the audio context for the rest of the session.
  useEffect(() => {
    const unlock = () => {
      unlockAudio();
      resumeBackgroundMusic();
    };
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  const changeSound = (value: boolean) => {
    setSoundEnabled(value);
    setSoundOn(value);
  };

  const changeBackgroundMusic = (value: boolean) => {
    setBackgroundMusicEnabled(value);
    setBackgroundMusicOn(value);
  };

  const changeBackgroundMusicVolume = (value: number) => {
    setBackgroundMusicVolume(value);
    setBackgroundMusicVolumeState(value);
  };

  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <Routes>
        <Route path="/r/:roomCode" element={<JoinRoomRoute />} />
        <Route path="/simulation" element={<SimulationRoute />} />
        <Route
          path="/*"
          element={(
            <MainApp
              comfortSize={comfortSize}
              onComfortSizeChange={setComfortSize}
              soundOn={soundOn}
              onSoundChange={changeSound}
              backgroundMusicOn={backgroundMusicOn}
              backgroundMusicVolume={backgroundMusicVolume}
              onBackgroundMusicChange={changeBackgroundMusic}
              onBackgroundMusicVolumeChange={changeBackgroundMusicVolume}
            />
          )}
        />
      </Routes>
    </BrowserRouter>
  );
};

const JoinRoomRoute: React.FC = () => {
  const { roomCode } = useParams<{ roomCode: string }>();
  const navigate = useNavigate();
  const routeLocation = useLocation();
  const routeState = routeLocation.state as RouteState | null;
  const savedSession = roomCode ? findSavedRoomSessionForRoom(roomCode) : null;

  if (!roomCode) return <div>Invalid room code</div>;

  return (
    <div className="app">
      <JoinRoomScreen
        roomCode={roomCode.toUpperCase()}
        onJoinRoom={(code, username) => {
          const sessionToken = findSavedRoomSession(code, username)?.sessionToken;
          navigate(`/${routeLocation.search}`, {
            state: { joinRoom: { roomCode: code, username, sessionToken } },
          });
        }}
        onBackToMenu={() => navigate('/')}
        error={routeState?.error || null}
        initialUsername={routeState?.username || savedSession?.username || ''}
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
  soundOn: boolean;
  onSoundChange: (value: boolean) => void;
  backgroundMusicOn: boolean;
  backgroundMusicVolume: number;
  onBackgroundMusicChange: (value: boolean) => void;
  onBackgroundMusicVolumeChange: (value: number) => void;
}

const MainApp: React.FC<MainAppProps> = ({
  comfortSize,
  onComfortSizeChange,
  soundOn,
  onSoundChange,
  backgroundMusicOn,
  backgroundMusicVolume,
  onBackgroundMusicChange,
  onBackgroundMusicVolumeChange,
}) => {
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
  const [savedRoomSession, setSavedRoomSession] = useState<RoomSession | null>(() => (
    initialJoinRequest ? null : loadMostRecentSavedRoomSession()
  ));
  const socketRef = useRef<Socket | null>(null);
  const stateRef = useRef(appState);
  const joinRequestRef = useRef<JoinRequest | null>(null);
  const reconnectPendingRef = useRef(false);
  const actionPendingRef = useRef(false);
  const notificationTimer = useRef<number | null>(null);
  const resultTimer = useRef<number | null>(null);
  const finalPlayTimer = useRef<number | null>(null);
  const roundStartTimer = useRef<number | null>(null);

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

  function clearRoundStart() {
    if (roundStartTimer.current !== null) {
      window.clearTimeout(roundStartTimer.current);
      roundStartTimer.current = null;
    }
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
        socket.emit('reconnect_to_room', {
          roomCode: current.currentRoom,
          username: current.username,
          sessionToken: current.sessionToken,
        });
      } else {
        setAppState((previous) => ({ ...previous, loading: null }));
      }
    });

    socket.on('disconnect', (reason) => {
      actionPendingRef.current = false;
      clearRoundStart();
      setIsConnected(false);
      if (reason === 'io server disconnect') socket.connect();
    });

    socket.on('connect_error', () => setIsConnected(false));
    socket.io.on('reconnect_failed', () => {
      const current = stateRef.current;
      if (current.currentRoom && current.username) {
        setRecoverySession({
          roomCode: current.currentRoom,
          username: current.username,
          sessionToken: current.sessionToken,
        });
      }
      showError('Connection lost. Reconnect when your network is available.');
    });

    socket.on('room_created', ({ roomCode, sessionToken, gameState }) => {
      saveRoomSession({ roomCode, username: stateRef.current.username, sessionToken });
      setRecoverySession(null);
      setSavedRoomSession(null);
      setAppState((previous) => ({
        ...previous,
        currentRoom: roomCode,
        sessionToken,
        gameState,
        currentScreen: 'waiting',
        loading: null,
        error: null,
        gameEndedByDepartures: false,
      }));
    });

    socket.on('room_joined', ({ roomCode, sessionToken, gameState }) => {
      const username = joinRequestRef.current?.username || stateRef.current.username;
      joinRequestRef.current = null;
      saveRoomSession({ roomCode, username, sessionToken });
      setRecoverySession(null);
      setSavedRoomSession(null);
      setAppState((previous) => ({
        ...previous,
        currentRoom: roomCode,
        sessionToken,
        gameState,
        currentScreen: 'waiting',
        loading: null,
        error: null,
        gameEndedByDepartures: false,
      }));
    });

    socket.on('player_joined', ({ playerName, gameState }) => {
      const hasMinimumPlayers = gameState.players.filter((player: Player) => player.connected).length >= 3;
      setAppState((previous) => ({
        ...previous,
        gameState,
        gameEndedByDepartures: hasMinimumPlayers ? false : previous.gameEndedByDepartures,
      }));
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

    socket.on('room_reconnected', ({ roomCode, sessionToken, gameState, myCards, validMoves, canPass }) => {
      reconnectPendingRef.current = false;
      clearRoundStart();
      const username = joinRequestRef.current?.username || stateRef.current.username;
      joinRequestRef.current = null;
      saveRoomSession({ roomCode, username, sessionToken });
      setRecoverySession(null);
      setSavedRoomSession(null);
      setShowingGameOverDelay(false);
      setAppState((previous) => ({
        ...previous,
        currentRoom: roomCode,
        sessionToken,
        gameState,
        myCards: myCards || previous.myCards,
        validMoves: validMoves || previous.validMoves,
        canPass: Boolean(canPass),
        winner: gameState?.gameFinished ? gameState.roundResult || previous.winner : null,
        currentScreen: screenForGameState(gameState),
        loading: null,
        error: null,
        gameEndedByDepartures: false,
      }));
    });

    socket.on('game_started', ({ gameState }) => {
      actionPendingRef.current = false;
      clearRoundStart();
      playDealSound();
      setAppState((previous) => ({
        ...previous,
        gameState,
        currentScreen: 'game',
        loading: null,
        winner: null,
        gameEndedByDepartures: false,
      }));
    });

    socket.on('your_cards', ({ cards, validMoves, canPass }) => {
      actionPendingRef.current = false;
      setAppState((previous) => ({
        ...previous,
        myCards: cards,
        validMoves,
        canPass: Boolean(canPass),
      }));
    });

    socket.on('card_played', ({ gameState }) => {
      actionPendingRef.current = false;
      playCardSound();
      setAppState((previous) => ({ ...previous, gameState }));
    });

    socket.on('turn_passed', ({ gameState }) => {
      actionPendingRef.current = false;
      playKnockSound();
      setAppState((previous) => ({ ...previous, gameState }));
    });

    socket.on('game_over', (winner: Winner) => {
      actionPendingRef.current = false;
      clearRoundStart();
      setAppState((previous) => ({ ...previous, winner }));
      if (finalPlayTimer.current !== null) window.clearTimeout(finalPlayTimer.current);
      if (resultTimer.current !== null) window.clearTimeout(resultTimer.current);
      finalPlayTimer.current = window.setTimeout(() => {
        setShowingGameOverDelay(true);
        setAppState((previous) => ({ ...previous, currentScreen: 'game-over' }));
        resultTimer.current = window.setTimeout(() => {
          setShowingGameOverDelay(false);
          if (winner.winner === stateRef.current.username) playRoundWinSound();
        }, SCORE_COUNTING_SPLASH_MS);
      }, 2500);
    });

    socket.on('game_abandoned', ({ message, recoveryFailure }: { message: string; recoveryFailure?: boolean }) => {
      if (recoveryFailure && joinRequestRef.current && !joinRequestRef.current.sessionToken) return;
      actionPendingRef.current = false;
      reconnectPendingRef.current = false;
      clearRoundStart();
      clearRoomSession();
      setRecoverySession(null);
      setSavedRoomSession(null);
      setShowingGameOverDelay(false);
      if (resultTimer.current !== null) window.clearTimeout(resultTimer.current);
      if (finalPlayTimer.current !== null) window.clearTimeout(finalPlayTimer.current);
      setAppState((previous) => endAbandonedGame(previous, message));
    });

    socket.on('cards_redistributed', ({ message }) => notify(message));

    socket.on('not_enough_players', ({ gameState }) => {
      actionPendingRef.current = false;
      setShowingGameOverDelay(false);
      setAppState((previous) => ({
        ...previous,
        gameState,
        myCards: [],
        validMoves: [],
        canPass: false,
        isMyTurn: false,
        winner: null,
        currentScreen: 'waiting',
        loading: null,
        error: null,
        gameEndedByDepartures: true,
      }));
    });

    socket.on('round_continued', ({ gameState }) => {
      actionPendingRef.current = false;
      clearRoundStart();
      playDealSound();
      setShowingGameOverDelay(false);

      if (!gameState.dealSummary) {
        setAppState((previous) => ({
          ...previous,
          gameState,
          currentScreen: 'game',
          loading: null,
          winner: null,
          gameEndedByDepartures: false,
        }));
        return;
      }

      setAppState((previous) => ({
        ...previous,
        gameState,
        currentScreen: 'round-start',
        loading: null,
        winner: null,
        isMyTurn: false,
        gameEndedByDepartures: false,
      }));
      roundStartTimer.current = window.setTimeout(() => {
        roundStartTimer.current = null;
        setAppState((previous) => (
          previous.currentScreen === 'round-start'
            ? { ...previous, currentScreen: 'game' }
            : previous
        ));
      }, NEXT_ROUND_SPLASH_MS);
    });

    socket.on('turn_duration_changed', ({ gameState }) => {
      setAppState((previous) => ({ ...previous, gameState }));
    });

    socket.on('game_totals', (summary: GameSummary) => {
      clearRoundStart();
      clearRoomSession();
      if (summary.winner === stateRef.current.username) playGameWinSound();
      setAppState((previous) => ({ ...previous, currentScreen: 'summary', loading: null, summary }));
    });

    socket.on('left_room', () => {
      actionPendingRef.current = false;
      reconnectPendingRef.current = false;
      clearRoomSession();
    });

    socket.on('game_state', (playerState) => {
      if (!playerState) return;
      reconnectPendingRef.current = false;
      const gameState = playerState.gameState || playerState;
      setAppState((previous) => ({
        ...previous,
        gameState,
        myCards: playerState.myCards || [],
        validMoves: playerState.validMoves || [],
        canPass: Boolean(playerState.canPass),
        winner: gameState?.gameFinished ? gameState.roundResult || previous.winner : null,
        currentScreen: previous.currentScreen === 'round-start'
          ? 'round-start'
          : screenForGameState(gameState),
        loading: null,
        error: null,
      }));
    });

    socket.on('error', (message: string | Error | ServerErrorPayload) => {
      actionPendingRef.current = false;
      const errorMessage = getServerErrorMessage(message);
      const errorCode = typeof message === 'object' && !(message instanceof Error) ? message.code : undefined;
      const current = stateRef.current;
      const recoveryEnded =
        (errorCode === 'ROOM_NOT_FOUND' || errorCode === 'RECONNECT_UNAVAILABLE') &&
        Boolean(current.currentRoom && current.username && current.sessionToken);

      if (recoveryEnded) {
        reconnectPendingRef.current = false;
        setRecoverySession(null);
        setSavedRoomSession(null);
        clearRoomSession({
          roomCode: current.currentRoom,
          username: current.username,
          sessionToken: current.sessionToken,
        });

        const pendingJoin = joinRequestRef.current;
        if (pendingJoin?.sessionToken && errorCode === 'RECONNECT_UNAVAILABLE') {
          const freshJoin = { roomCode: pendingJoin.roomCode, username: pendingJoin.username };
          joinRequestRef.current = freshJoin;
          setAppState((previous) => ({
            ...previous,
            currentRoom: '',
            sessionToken: '',
            currentScreen: 'loading',
            loading: 'Joining room…',
            error: null,
          }));
          socket.emit('join_room', freshJoin);
          return;
        }

        if (pendingJoin) {
          joinRequestRef.current = null;
          setAppState((previous) => ({
            ...previous,
            currentRoom: '',
            sessionToken: '',
            gameState: null,
            loading: null,
            error: null,
          }));
          navigate(`/r/${pendingJoin.roomCode}`, {
            state: { error: errorMessage, username: pendingJoin.username },
            replace: true,
          });
          return;
        }

        const endedMessage = errorCode === 'ROOM_NOT_FOUND'
          ? 'This game has ended.'
          : 'Your seat in this game has expired.';
        setAppState((previous) => endAbandonedGame(previous, endedMessage));
        navigate('/', { replace: true });
        return;
      }

      if (reconnectPendingRef.current) {
        reconnectPendingRef.current = false;
        if (current.currentRoom && current.username) {
          setRecoverySession({
            roomCode: current.currentRoom,
            username: current.username,
            sessionToken: current.sessionToken,
          });
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
      const joinError = ['room code is wrong', 'room is full', 'game has already started', 'reserved seat']
        .some((text) => errorMessage.toLowerCase().includes(text));
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
      if (!current.currentRoom || reconnectPendingRef.current) return;

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
      clearRoundStart();
      socket.close();
      socketRef.current = null;
    };
  }, [navigate]);

  useEffect(() => {
    const request = (location.state as RouteState | null)?.joinRoom;
    if (!request || !isConnected || !socketRef.current) return;
    if (!request.sessionToken) clearRoomSession();
    joinRequestRef.current = request;
    reconnectPendingRef.current = Boolean(request.sessionToken);
    setAppState((previous) => ({
      ...previous,
      username: request.username,
      currentRoom: request.sessionToken ? request.roomCode.toUpperCase() : '',
      sessionToken: request.sessionToken || '',
      currentScreen: 'loading',
      loading: request.sessionToken ? 'Reconnecting to your room…' : 'Joining room…',
    }));
    navigate('/', { replace: true });
    if (request.sessionToken) {
      socketRef.current.emit('reconnect_to_room', {
        roomCode: request.roomCode.toUpperCase(),
        username: request.username,
        sessionToken: request.sessionToken,
      });
    } else {
      socketRef.current.emit('join_room', {
        roomCode: request.roomCode.toUpperCase(),
        username: request.username,
      });
    }
  }, [isConnected, location.state, navigate]);

  // Turn timing is server-authoritative: when a turn expires the server
  // plays or passes for the current player and broadcasts the result.
  // The client only renders the countdown.

  useEffect(() => {
    const isMyTurn =
      isConnected &&
      appState.currentScreen === 'game' &&
      appState.gameState?.currentPlayerName === appState.username;
    if (isMyTurn !== appState.isMyTurn) setAppState((previous) => ({ ...previous, isMyTurn }));
  }, [appState.currentScreen, appState.gameState?.currentPlayerName, appState.isMyTurn, appState.username, isConnected]);

  function requireConnection() {
    if (socketRef.current?.connected && isConnected) return socketRef.current;
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
      sessionToken: session.sessionToken,
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

  function continueSavedRoom() {
    const session = savedRoomSession;
    const socket = requireConnection();
    if (!session || !socket) return;

    saveRoomSession(session);
    reconnectPendingRef.current = true;
    setSavedRoomSession(null);
    setAppState((previous) => ({
      ...previous,
      username: session.username,
      currentRoom: session.roomCode,
      sessionToken: session.sessionToken,
      currentScreen: 'loading',
      loading: 'Checking your saved game…',
      error: null,
    }));
    socket.emit('reconnect_to_room', session);
  }

  function joinRoom(roomCode: string, username = appState.username) {
    const socket = requireConnection();
    if (!socket || !username) return;
    if (roomCode.length !== 6) return showError('Enter a valid six-character room code.');
    showLoading('Joining room…');
    socket.emit('join_room', { roomCode: roomCode.toUpperCase(), username });
  }

  function startGame() {
    const count = appState.gameState?.players.filter((player) => player.connected).length || 0;
    if (count < 3 || count > 11) return showError('A game needs between 3 and 11 connected players.');
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
    clearRoundStart();
    clearRoomSession();
    setRecoverySession(null);
    if (appState.currentRoom && socketRef.current?.connected) {
      socketRef.current.emit('leave_room');
    }
    setAppState((previous) => ({
      ...previous,
      currentRoom: '',
      sessionToken: '',
      gameState: null,
      myCards: [],
      validMoves: [],
      canPass: false,
      isMyTurn: false,
      currentScreen: 'menu',
      winner: null,
      summary: null,
      gameEndedByDepartures: false,
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
    const hasMinimumPlayers = Boolean(
      appState.gameState &&
      appState.gameState.players.length >= 3 &&
      appState.gameState.players.every((player) => player.connected)
    );
    const canFinishGame = appState.gameState?.players[0]?.name === appState.username;

    switch (appState.currentScreen) {
      case 'login':
        return <LoginScreen onContinue={(username) => setAppState((previous) => ({ ...previous, username, currentScreen: 'menu' }))} comfortSize={comfortSize} onComfortSizeChange={onComfortSizeChange} />;
      case 'menu':
        return <MenuScreen username={appState.username} onCreateRoom={createRoom} onJoinRoom={joinRoom} savedRoomCode={savedRoomSession?.roomCode} onContinueRoom={savedRoomSession ? continueSavedRoom : undefined} comfortSize={comfortSize} onComfortSizeChange={onComfortSizeChange} backgroundMusicOn={backgroundMusicOn} backgroundMusicVolume={backgroundMusicVolume} gameSoundsOn={soundOn} onBackgroundMusicChange={onBackgroundMusicChange} onBackgroundMusicVolumeChange={onBackgroundMusicVolumeChange} onGameSoundsChange={onSoundChange} />;
      case 'waiting':
        return <WaitingRoom roomCode={appState.currentRoom} gameState={appState.gameState} username={appState.username} gameEndedByDepartures={appState.gameEndedByDepartures} onStartGame={startGame} onLeaveRoom={leaveRoom} onShowNotification={notify} onReturnToGameDesk={leaveRoomForGameDesk} onSetTurnDuration={setTurnDuration} comfortSize={comfortSize} onComfortSizeChange={onComfortSizeChange} backgroundMusicOn={backgroundMusicOn} backgroundMusicVolume={backgroundMusicVolume} gameSoundsOn={soundOn} onBackgroundMusicChange={onBackgroundMusicChange} onBackgroundMusicVolumeChange={onBackgroundMusicVolumeChange} onGameSoundsChange={onSoundChange} />;
      case 'game':
        return <GameScreen gameState={appState.gameState} myCards={appState.myCards} validMoves={appState.validMoves} isMyTurn={appState.isMyTurn} canPass={appState.canPass} username={appState.username} onPlayCard={playCard} onPassTurn={passTurn} onLeaveGame={leaveRoom} comfortSize={comfortSize} onComfortSizeChange={onComfortSizeChange} backgroundMusicOn={backgroundMusicOn} backgroundMusicVolume={backgroundMusicVolume} gameSoundsOn={soundOn} onBackgroundMusicChange={onBackgroundMusicChange} onBackgroundMusicVolumeChange={onBackgroundMusicVolumeChange} onGameSoundsChange={onSoundChange} onReturnToGameDesk={leaveRoomForGameDesk} roundWinnerName={appState.gameState?.gameFinished ? appState.winner?.winner : undefined} />;
      case 'game-over':
        return <GameOverScreen winner={appState.winner} username={appState.username} onContinueRound={() => { showLoading('Starting next round…'); socketRef.current?.emit('continue_round'); }} onExitGame={() => { showLoading('Calculating results…'); socketRef.current?.emit('exit_game'); }} showingDelay={showingGameOverDelay} canContinueRound={Boolean(hasMinimumPlayers && appState.gameState && appState.gameState.round < appState.gameState.maxRounds)} hasMinimumPlayers={hasMinimumPlayers} canFinishGame={canFinishGame} onReturnToGameDesk={leaveRoomForGameDesk} />;
      case 'round-start':
        return appState.gameState?.dealSummary
          ? <RoundStartScreen round={appState.gameState.round} summary={appState.gameState.dealSummary} />
          : <LoadingScreen message="Dealing the next round…" onReturnToGameDesk={leaveRoomForGameDesk} />;
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
