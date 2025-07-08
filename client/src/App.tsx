import React, { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import './App.css';
import ErrorModal from './components/ErrorModal';
import GameOverScreen from './components/GameOverScreen';
import GameScreen from './components/GameScreen';
import LoadingScreen from './components/LoadingScreen';
import LoginScreen from './components/LoginScreen';
import MenuScreen from './components/MenuScreen';
import Notification from './components/Notification';
import SummaryScreen from './components/SummaryScreen';
import WaitingRoom from './components/WaitingRoom';
import { AppState, Card, GameSummary, Winner } from './types';

const App: React.FC = () => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [appState, setAppState] = useState<AppState>({
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

  const [showingGameOverDelay, setShowingGameOverDelay] = useState(false);

  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const [autoPassTimeout, setAutoPassTimeout] = useState<number | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  
  // Refs to store current state values for auto-play
  const currentStateRef = useRef(appState);
  
  // Update ref whenever appState changes
  useEffect(() => {
    currentStateRef.current = appState;
  }, [appState]);

  const maxReconnectAttempts = 5;

  // Initialize socket connection (run only once on mount)
  useEffect(() => {
    const newSocket = io({
      timeout: 60000,
      forceNew: true,
      reconnection: true,
      reconnectionDelay: 2000,
      reconnectionDelayMax: 10000,
      reconnectionAttempts: 5,
    });
    setSocket(newSocket);

    // Connection events
    newSocket.on('connect', () => {
      console.log('Connected to server');
      console.log('Socket ID:', newSocket.id);
      setReconnectAttempts(0);
      setIsConnected(true);
      setAppState(prev => ({ ...prev, loading: null }));
    });

    newSocket.on('disconnect', (reason) => {
      console.log('Disconnected from server. Reason:', reason);
      setIsConnected(false);
      
      // Only attempt manual reconnection for certain disconnect reasons
      if (reason === 'io server disconnect' || reason === 'transport close' || reason === 'ping timeout') {
        showLoading('Connection lost. Reconnecting...');
        attemptReconnection();
      }
    });

    newSocket.on('connect_error', (error) => {
      console.error('Connection error:', error);
      setIsConnected(false);
      if (reconnectAttempts < maxReconnectAttempts) {
        showLoading(`Connection failed. Retrying... (${reconnectAttempts + 1}/${maxReconnectAttempts})`);
        attemptReconnection();
      } else {
        showError('Connection failed. Please refresh the page.');
      }
    });

    // Room events
    newSocket.on('room_created', ({ roomCode, gameState }) => {
      console.log('Room created:', roomCode);
      setAppState(prev => ({
        ...prev,
        currentRoom: roomCode,
        gameState,
        currentScreen: 'waiting',
        loading: null,
      }));
    });

    newSocket.on('room_joined', ({ roomCode, gameState }) => {
      console.log('Room joined:', roomCode);
      setAppState(prev => ({
        ...prev,
        currentRoom: roomCode,
        gameState,
        currentScreen: 'waiting',
        loading: null,
      }));
    });

    newSocket.on('player_joined', ({ playerName, gameState }) => {
      console.log('Player joined:', playerName);
      setAppState(prev => ({ ...prev, gameState }));
      showNotification(`${playerName} joined the room`);
    });

    newSocket.on('player_disconnected', ({ playerName, gameState }) => {
      console.log('Player disconnected:', playerName);
      setAppState(prev => ({ ...prev, gameState }));
      showNotification(`${playerName} disconnected`);
    });

    // Game events
    newSocket.on('game_started', ({ gameState }) => {
      console.log('Game started');
      setAppState(prev => ({
        ...prev,
        gameState,
        currentScreen: 'game',
      }));
    });

    newSocket.on('your_cards', ({ cards, validMoves }) => {
      console.log('Received cards:', cards.length, 'Valid moves:', validMoves.length);
      console.log('Valid moves details:', validMoves);
      setAppState(prev => ({
        ...prev,
        myCards: cards,
        validMoves,
        canPass: validMoves.length === 0,
      }));
    });

    newSocket.on('card_played', ({ playerName, card, gameState }) => {
      console.log(`${playerName} played ${card.rank} of ${card.suit}`);
      setAppState(prev => ({ ...prev, gameState }));
      showNotification(`${playerName} played ${getRankDisplay(card.rank)} of ${getSuitName(card.suit)}`);
    });

    newSocket.on('turn_passed', ({ playerName, gameState }) => {
      console.log(`${playerName} passed`);
      setAppState(prev => ({ ...prev, gameState }));
      showNotification(`${playerName} passed`);
    });

    newSocket.on('game_over', (winner: Winner) => {
      console.log('Game over:', winner);
      clearAutoPlayTimers();
      
      // Show initial "Game Over" message for 2 seconds
      setShowingGameOverDelay(true);
      setAppState(prev => ({
        ...prev,
        currentScreen: 'game-over',
        winner,
      }));
      
      // After 2 seconds, show the actual scoring screen
      setTimeout(() => {
        setShowingGameOverDelay(false);
      }, 2000);
    });

    newSocket.on('cards_redistributed', (data) => {
      console.log('Cards redistributed:', data);
      showNotification(data.message);
    });

    newSocket.on('round_continued', ({ gameState }) => {
      console.log('Round continued');
      setAppState(prev => ({
        ...prev,
        gameState,
        currentScreen: 'game',
        loading: null,
      }));
    });

    newSocket.on('game_totals', (summary: GameSummary) => {
      console.log('Received game totals', summary);
      setAppState(prev => ({
        ...prev,
        currentScreen: 'summary',
        loading: null,
        summary,
      }));
    });

    newSocket.on('error', (message: string) => {
      console.error('Server error:', message);
      showError(message);
    });

    // Periodic connection health check
    const healthCheckInterval = setInterval(() => {
      if (newSocket && newSocket.connected) {
        // Send a ping to verify connection health
        newSocket.emit('ping', Date.now());
      }
    }, 30000); // Check every 30 seconds

    return () => {
      clearInterval(healthCheckInterval);
      newSocket.close();
    };
  }, []);

  // Auto-play logic
  useEffect(() => {
    console.log('Auto-play useEffect triggered. isMyTurn:', appState.isMyTurn, 'currentPlayer:', appState.gameState?.currentPlayerName, 'username:', appState.username, 'currentScreen:', appState.currentScreen);
    
    if (appState.gameState && appState.isMyTurn && appState.currentScreen === 'game') {
      console.log('Setting up auto-play timeout');
      clearAutoPlayTimers();

      const timeoutId = setTimeout(() => {
        console.log('Auto-play timeout fired!');
        const current = currentStateRef.current;
        console.log('Current state at timeout:');
        console.log('- isMyTurn:', current.isMyTurn);
        console.log('- currentPlayer:', current.gameState?.currentPlayerName);
        console.log('- username:', current.username);
        console.log('- validMoves:', current.validMoves);
        console.log('- canPass:', current.canPass);
        console.log('- currentScreen:', current.currentScreen);
        
        // Only auto-play if still in game screen and conditions are met
        if (current.isMyTurn && 
            current.gameState?.currentPlayerName === current.username && 
            current.currentScreen === 'game') {
          console.log('Conditions met for auto-play');
          
          if (current.validMoves.length > 0) {
            const randomMove = current.validMoves[Math.floor(Math.random() * current.validMoves.length)];
            console.log('Auto-playing random card:', randomMove);
            showNotification('Auto-playing random card');
            playCard(randomMove);
          } else if (current.canPass) {
            console.log('Auto-passing turn');
            showNotification('Auto-passing turn');
            passTurn();
          } else {
            console.log('Auto-play: No valid moves and cannot pass');
          }
        } else {
          console.log('Conditions NOT met for auto-play - game may have ended or screen changed');
        }
      }, 15000);

      setAutoPassTimeout(timeoutId);
    } else {
      console.log('Not setting up auto-play - not my turn, no game state, or not in game screen');
      clearAutoPlayTimers();
    }

    return () => {
      console.log('Auto-play useEffect cleanup');
      clearAutoPlayTimers();
    };
  }, [appState.isMyTurn, appState.gameState?.currentPlayerName, appState.validMoves, appState.canPass, appState.currentScreen]);

  // Update isMyTurn based on game state
  useEffect(() => {
    if (appState.gameState) {
      const isMyTurn = appState.gameState.currentPlayerName === appState.username;
      console.log('Turn detection: currentPlayer =', appState.gameState.currentPlayerName, 'username =', appState.username, 'isMyTurn =', isMyTurn);
      setAppState(prev => ({ ...prev, isMyTurn }));
    }
  }, [appState.gameState?.currentPlayerName, appState.username]);

  const clearAutoPlayTimers = () => {
    if (autoPassTimeout) {
      clearTimeout(autoPassTimeout);
      setAutoPassTimeout(null);
    }
  };

  const attemptReconnection = () => {
    if (reconnectAttempts >= maxReconnectAttempts) {
      showError('Connection lost. Please refresh the page to rejoin.');
      setIsConnected(false);
      return;
    }

    setReconnectAttempts(prev => prev + 1);
    showLoading(`Reconnecting... (${reconnectAttempts + 1}/${maxReconnectAttempts})`);

    setTimeout(() => {
      if (socket && (!socket.connected || socket.disconnected)) {
        console.log('Attempting manual reconnection...');
        socket.connect();
      }
    }, 2000 * (reconnectAttempts + 1));
  };

  const showError = (message: string) => {
    setAppState(prev => ({ ...prev, error: message, loading: null }));
  };

  const showNotification = (message: string) => {
    setAppState(prev => ({ ...prev, notification: message }));
    setTimeout(() => {
      setAppState(prev => ({ ...prev, notification: null }));
    }, 3000);
  };

  const showLoading = (message: string) => {
    setAppState(prev => ({ ...prev, loading: message, currentScreen: 'loading' }));
  };


  const closeError = () => {
    setAppState(prev => ({ ...prev, error: null }));
  };

  const setUsername = (username: string) => {
    setAppState(prev => ({ ...prev, username, currentScreen: 'menu' }));
  };

  const createRoom = () => {
    if (!appState.username) {
      showError('Please enter your name first');
      return;
    }

    if (!socket || !isConnected) {
      showError('Not connected to server. Please wait for reconnection or refresh the page.');
      return;
    }

    showLoading('Creating room...');
    socket.emit('create_room', appState.username);
  };

  const joinRoom = (roomCode: string) => {
    if (!appState.username) {
      showError('Please enter your name first');
      return;
    }

    if (!roomCode || roomCode.length !== 6) {
      showError('Please enter a valid 6-character room code');
      return;
    }

    if (!socket || !isConnected) {
      showError('Not connected to server. Please wait for reconnection or refresh the page.');
      return;
    }

    showLoading('Joining room...');
    socket.emit('join_room', { roomCode: roomCode.toUpperCase(), username: appState.username });
  };

  const startGame = () => {
    if (!appState.gameState || appState.gameState.players.length <= 1) {
      showError('Need at least 2 players to start');
      return;
    }

    if (appState.gameState.players.length > 11) {
      showError('Too many players (max 11)');
      return;
    }

    showLoading('Starting game...');
    socket?.emit('start_game');
  };

  const playCard = (card: Card) => {
    if (appState.currentScreen !== 'game') {
      console.log('Preventing play card - not in game screen:', appState.currentScreen);
      return;
    }

    if (!appState.isMyTurn) {
      showError("It's not your turn");
      return;
    }

    if (!appState.validMoves.some(move => move.suit === card.suit && move.rank === card.rank)) {
      showError('Invalid move');
      return;
    }

    clearAutoPlayTimers();
    socket?.emit('play_card', card);
  };

  const passTurn = () => {
    if (appState.currentScreen !== 'game') {
      console.log('Preventing pass turn - not in game screen:', appState.currentScreen);
      return;
    }

    if (!appState.isMyTurn) {
      showError("It's not your turn");
      return;
    }

    if (!appState.canPass) {
      showError('You have valid moves - cannot pass');
      return;
    }

    clearAutoPlayTimers();
    socket?.emit('pass_turn');
  };

  const leaveRoom = () => {
    setAppState(prev => ({
      ...prev,
      currentRoom: '',
      gameState: null,
      myCards: [],
      validMoves: [],
      currentScreen: 'menu',
      winner: null,
      summary: null,
    }));
    clearAutoPlayTimers();
    socket?.disconnect();
    socket?.connect();
  };

  const continueRound = () => {
    showLoading('Starting next round...');
    socket?.emit('continue_round');
  };

  const exitGame = () => {
    showLoading('Calculating results...');
    socket?.emit('exit_game');
  };

  const returnToMenu = () => {
    leaveRoom();
  };

  // Utility functions
  const getRankDisplay = (rank: number): string => {
    if (rank === 1) return 'A';
    if (rank === 11) return 'J';
    if (rank === 12) return 'Q';
    if (rank === 13) return 'K';
    return rank.toString();
  };

  const getSuitName = (suit: string): string => {
    const names: Record<string, string> = {
      hearts: 'Hearts',
      diamonds: 'Diamonds',
      clubs: 'Clubs',
      spades: 'Spades',
    };
    return names[suit] || suit;
  };

  const renderCurrentScreen = () => {
    switch (appState.currentScreen) {
      case 'login':
        return <LoginScreen onContinue={setUsername} />;
      case 'menu':
        return <MenuScreen username={appState.username} onCreateRoom={createRoom} onJoinRoom={joinRoom} />;
      case 'waiting':
        return (
          <WaitingRoom
            roomCode={appState.currentRoom}
            gameState={appState.gameState}
            username={appState.username}
            onStartGame={startGame}
            onLeaveRoom={leaveRoom}
          />
        );
      case 'game':
        return (
          <GameScreen
            gameState={appState.gameState}
            myCards={appState.myCards}
            validMoves={appState.validMoves}
            isMyTurn={appState.isMyTurn}
            canPass={appState.canPass}
            username={appState.username}
            onPlayCard={playCard}
            onPassTurn={passTurn}
            onLeaveGame={leaveRoom}
          />
        );
      case 'game-over':
        return <GameOverScreen winner={appState.winner} onContinueRound={continueRound} onExitGame={exitGame} showingDelay={showingGameOverDelay} />;
      case 'loading':
        return <LoadingScreen message={appState.loading || 'Loading...'} />;
      case 'summary':
        return <SummaryScreen summary={appState.summary} onReturnToMenu={returnToMenu} />;
      default:
        return <LoginScreen onContinue={setUsername} />;
    }
  };

  return (
    <div className="app">
      {renderCurrentScreen()}
      {appState.error && <ErrorModal message={appState.error} onClose={closeError} />}
      {appState.notification && <Notification message={appState.notification} />}
    </div>
  );
};

export default App;