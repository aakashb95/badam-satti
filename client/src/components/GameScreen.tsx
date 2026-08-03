import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Card, ComfortSize, GameState, Player } from '../types';
import HelpModal from './HelpModal';
import GameDeskLink from './GameDeskLink';
import SoundToggle from './SoundToggle';
import { SUIT_LABELS, SuitIcon, getCardSrc, getRankDisplay } from '../cards';

interface GameScreenProps {
  gameState: GameState | null;
  myCards: Card[];
  validMoves: Card[];
  isMyTurn: boolean;
  canPass: boolean;
  username: string;
  onPlayCard: (card: Card) => void;
  onPassTurn: () => void;
  onLeaveGame: () => void;
  comfortSize: ComfortSize;
  onComfortSizeChange: (size: ComfortSize) => void;
  soundOn: boolean;
  onSoundChange: (value: boolean) => void;
  onReturnToGameDesk: () => Promise<void>;
  roundWinnerName?: string;
}

const SUITS: Card['suit'][] = ['hearts', 'diamonds', 'clubs', 'spades'];
const COMFORT_SIZES: ComfortSize[] = ['standard', 'large', 'extra-large', 'maximum'];
const COMFORT_BUTTON_LABELS: Record<ComfortSize, string> = { standard: 'A', large: 'A+', 'extra-large': 'A++', maximum: 'A+++' };
const CLOCK_DIVISIONS = 12;
const DEFAULT_TURN_SECONDS = 20;

const isOpeningDeal = (gameState: GameState | null) =>
  Boolean(gameState && !gameState.gameFinished && (gameState.playHistory?.length || 0) <= 1);

const GameScreen: React.FC<GameScreenProps> = ({
  gameState,
  myCards,
  validMoves,
  isMyTurn,
  canPass,
  username,
  onPlayCard,
  onPassTurn,
  onLeaveGame,
  comfortSize,
  onComfortSizeChange,
  soundOn,
  onSoundChange,
  onReturnToGameDesk,
  roundWinnerName,
}) => {
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [showHelp, setShowHelp] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [showRoundIntro, setShowRoundIntro] = useState(() => isOpeningDeal(gameState));
  const [selectedCardKey, setSelectedCardKey] = useState<string | null>(null);
  const [pendingCard, setPendingCard] = useState<string | null>(null);
  const intentionalLeave = useRef(false);

  const nextComfortSize = () => {
    const index = COMFORT_SIZES.indexOf(comfortSize);
    onComfortSizeChange(COMFORT_SIZES[(index + 1) % COMFORT_SIZES.length]);
  };

  const seatedPlayers = useMemo(() => {
    if (!gameState) return [];
    const myIndex = gameState.players.findIndex((player) => player.name === username);
    if (myIndex < 0) return gameState.players;
    return [...gameState.players.slice(myIndex), ...gameState.players.slice(0, myIndex)];
  }, [gameState, username]);

  const sortedHand = useMemo(
    () => [...myCards].sort((first, second) => {
      const suitDifference = SUITS.indexOf(first.suit) - SUITS.indexOf(second.suit);
      return suitDifference || first.rank - second.rank;
    }),
    [myCards],
  );

  useEffect(() => {
    const marker = { ...window.history.state, gameLeaveGuard: true };
    window.history.pushState(marker, '', window.location.href);

    const guardBack = () => {
      if (intentionalLeave.current) return;
      window.history.pushState(marker, '', window.location.href);
      setShowLeaveConfirm(true);
    };
    const guardUnload = (event: BeforeUnloadEvent) => {
      if (intentionalLeave.current) return;
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('popstate', guardBack);
    window.addEventListener('beforeunload', guardUnload);
    return () => {
      window.removeEventListener('popstate', guardBack);
      window.removeEventListener('beforeunload', guardUnload);
    };
  }, []);

  useEffect(() => {
    const shouldShow = isOpeningDeal(gameState);
    setShowRoundIntro(shouldShow);
    if (!shouldShow) return;

    const timer = window.setTimeout(() => setShowRoundIntro(false), 3000);
    return () => window.clearTimeout(timer);
  }, [gameState?.gameFinished, gameState?.round]);

  // The server owns turn timing; this clock only renders the countdown.
  useEffect(() => {
    const interval = window.setInterval(() => setNowMs(Date.now()), 500);
    return () => window.clearInterval(interval);
  }, []);

  const turnDurationSeconds = gameState?.turnDurationSeconds ?? DEFAULT_TURN_SECONDS;
  const turnStartedAt = gameState?.turnStartedAt;
  const timeLeft = turnStartedAt
    ? Math.min(turnDurationSeconds, Math.max(0, Math.ceil((turnStartedAt + turnDurationSeconds * 1000 - nowMs) / 1000)))
    : turnDurationSeconds;
  const turnActive = Boolean(gameState?.started && !gameState?.gameFinished);

  useEffect(() => {
    setSelectedCardKey(null);
    setPendingCard(null);
  }, [isMyTurn, myCards]);

  useEffect(() => {
    if (!selectedCardKey) return;
    const stillPlayable = validMoves.some((card) => `${card.suit}-${card.rank}` === selectedCardKey);
    if (!isMyTurn || !stillPlayable) setSelectedCardKey(null);
  }, [isMyTurn, selectedCardKey, validMoves]);

  const isUrgent = isMyTurn && turnActive && timeLeft <= 5;

  useEffect(() => {
    if (isMyTurn && turnActive && timeLeft === 5 && typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(200);
  }, [isMyTurn, turnActive, timeLeft]);

  const confirmLeave = () => {
    intentionalLeave.current = true;
    setShowLeaveConfirm(false);
    onLeaveGame();
  };
  const returnToGameDeskSafely = async () => {
    intentionalLeave.current = true;
    await onReturnToGameDesk();
  };

  const isValidMove = (card: Card): boolean => validMoves.some((move) => move.suit === card.suit && move.rank === card.rank);

  const warningClass = (player: Player) => {
    if (player.indicator === 'critical') return 'critical-warning';
    if (player.indicator === 'warning') return 'warning-indicator';
    return '';
  };

  const playerStatus = (player: Player) =>
    `${player.cardCount} ${player.cardCount === 1 ? 'card' : 'cards'}`;

  const playHistory = gameState?.playHistory || [];
  const latestPlay = playHistory[playHistory.length - 1];
  const selectedCard = selectedCardKey
    ? sortedHand.find((card) => `${card.suit}-${card.rank}` === selectedCardKey)
    : undefined;

  const clockSeat = (index: number, total: number) => {
    const safeTotal = Math.max(total, 1);
    const clockPosition = (index * CLOCK_DIVISIONS) / safeTotal;
    const angle = (Math.PI * 2 * clockPosition) / CLOCK_DIVISIONS;
    const horizontalRadius = safeTotal >= 9 ? 42 : safeTotal >= 6 ? 42 : 37;
    const verticalRadius = safeTotal >= 9 ? 42 : safeTotal >= 6 ? 41 : 34;
    const x = 50 - Math.sin(angle) * horizontalRadius;
    const y = 50 + Math.cos(angle) * verticalRadius;

    return {
      clockPosition,
      style: {
        '--seat-x': `${x}%`,
        '--seat-y': `${y}%`,
        '--seat-order': index,
      } as React.CSSProperties,
    };
  };

  const minDealtCount = seatedPlayers.length
    ? Math.min(...seatedPlayers.map((player) => player.dealtCardCount || player.cardCount))
    : 0;

  const renderPlayers = () => (
    <section className="table-players" data-player-count={seatedPlayers.length} aria-label="Players seated clockwise around the table">
      {seatedPlayers.map((player, index) => {
        const seat = clockSeat(index, seatedPlayers.length);
        const playerMadeLatestPlay = latestPlay?.playerName === player.name;
        const playerLatestPlay = playerMadeLatestPlay ? latestPlay : undefined;
        const hasExtraCard = turnActive && (player.dealtCardCount || player.cardCount) > minDealtCount;
        const isNext = turnActive && !player.isCurrentPlayer && gameState?.nextPlayerName === player.name;
        const showsCountdown = turnActive && player.isCurrentPlayer;

        return (
          <div
            key={player.name}
            className={`table-player seat-${index} ${player.isCurrentPlayer ? 'is-current' : ''} ${player.name === username ? 'is-you' : ''} ${!player.connected ? 'is-disconnected' : ''} ${warningClass(player)}`}
            style={seat.style}
            data-seat-index={index}
            data-clock-position={Number(seat.clockPosition.toFixed(3))}
            aria-label={`${player.name === username ? 'You' : player.name}, clockwise seat ${index + 1} of ${seatedPlayers.length}, ${playerStatus(player)}${hasExtraCard ? ', dealt one extra card' : ''}${player.isCurrentPlayer ? ', playing now' : ''}${isNext ? ', plays next' : ''}${player.isDealer ? ', dealer' : ''}`}
          >
            {playerLatestPlay && (
              <span
                key={playerLatestPlay.id}
                className={`player-move-notice is-${playerLatestPlay.type}`}
                role="status"
                aria-label={playerLatestPlay.type === 'pass'
                  ? `${player.name} passed`
                  : playerLatestPlay.card
                    ? `${player.name} played ${getRankDisplay(playerLatestPlay.card.rank)} of ${SUIT_LABELS[playerLatestPlay.card.suit]}${playerLatestPlay.automatic ? ' automatically' : ''}`
                    : `${player.name} played a card`}
              >
                {playerLatestPlay.type === 'pass' ? (
                  <span>Pass</span>
                ) : playerLatestPlay.card ? (
                  <b data-suit={playerLatestPlay.card.suit}>
                    {getRankDisplay(playerLatestPlay.card.rank)}
                    <SuitIcon suit={playerLatestPlay.card.suit} />
                  </b>
                ) : null}
              </span>
            )}
            <span className="table-player-copy">
              <strong title={player.name}>
                {player.name === username ? 'You' : player.name}
                {player.isDealer && <span className="dealer-chip" title="Dealer">D</span>}
                {hasExtraCard && <span className="extra-card-chip" title="Dealt one extra card this round">+1</span>}
              </strong>
              <small>
                {player.cardCount}
                {showsCountdown && timeLeft < 10 && <span className="seat-countdown">· {timeLeft}s</span>}
              </small>
            </span>
            {isNext && <span className="next-chip" aria-hidden="true">next</span>}
          </div>
        );
      })}
    </section>
  );

  const renderBoard = () => {
    if (!gameState) return null;

    return (
      <section className="game-board" aria-label="Cards on the table">
        <div className="board-game-name" aria-hidden="true">Badam Satti</div>
        {SUITS.map((suit) => {
          const suitBoard = gameState.board[suit];
          const upSequence = [...(suitBoard.up || [])].sort((a, b) => b - a);
          const downSequence = [...(suitBoard.down || [])].sort((a, b) => b - a);
          const allRanks = Array.from(new Set([...upSequence, ...downSequence]));
          let displayRanks = allRanks;

          if (allRanks.length > 3) {
            const highestRank = allRanks[0];
            const lowestRank = allRanks[allRanks.length - 1];
            displayRanks = [highestRank];
            if (allRanks.includes(7) && highestRank !== 7 && lowestRank !== 7) displayRanks.push(7);
            displayRanks.push(lowestRank);
          }

          return (
            <div key={suit} className={`suit-pile ${allRanks.length ? 'has-cards' : 'is-empty'}`} data-suit={suit}>
              <div className="cards-display">
                {!displayRanks.length && (
                  <div className="empty-pile" aria-label={`${SUIT_LABELS[suit]} pile is empty`}>
                    <SuitIcon suit={suit} />
                  </div>
                )}
                {displayRanks.map((rank, index) => {
                  const card: Card = { suit, rank };
                  return (
                    <img
                      key={`${suit}-${rank}-${index}`}
                      src={getCardSrc(card)}
                      className={`board-card-img stack-${index}`}
                      alt={`${getRankDisplay(rank)} of ${SUIT_LABELS[suit]}`}
                      decoding="async"
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
      </section>
    );
  };

  const renderRoundIntro = () => {
    if (!gameState || !showRoundIntro) return null;
    const isLaterRound = gameState.round > 1;
    const displayName = (name: string) => name === username ? 'You' : name;
    const currentPlayer = gameState.players.find((player) => player.name === username);
    const lowestDealCount = Math.min(...gameState.players.map((player) => player.dealtCardCount));
    const receivedExtraCard = Boolean(currentPlayer && currentPlayer.dealtCardCount > lowestDealCount);

    return (
      <div className={`round-intro ${isLaterRound ? 'is-next-round' : ''}`} role="status" aria-live="polite" onClick={() => setShowRoundIntro(false)}>
        {isLaterRound ? (
          <>
            <span className="round-intro-kicker">Round {gameState.round}</span>
            <strong>Cards are dealt.</strong>
            <small>{displayName(gameState.dealerName)} had the most points last round.</small>
            <div className="round-intro-tiles">
              <span><small>Dealer</small><b>{displayName(gameState.dealerName)}</b></span>
              <span><small>Starts with 7♥</small><b>{displayName(gameState.heartsSevenPlayerName)}</b></span>
              <span className={receivedExtraCard ? 'has-extra-card' : ''}>
                <small>Your hand</small>
                <b>{currentPlayer?.dealtCardCount || 0} cards</b>
                {receivedExtraCard && <i>+1</i>}
              </span>
            </div>
          </>
        ) : (
          <strong>Round 1</strong>
        )}
        <small className="round-intro-dismiss">Tap to play</small>
      </div>
    );
  };

  const confirmSelectedCard = () => {
    if (!selectedCard || pendingCard || !isMyTurn || !isValidMove(selectedCard)) return;
    setPendingCard(selectedCardKey);
    onPlayCard(selectedCard);
  };

  const renderHand = () => (
    <section className={`hand-dock ${isMyTurn ? 'is-my-turn' : ''} ${isUrgent ? 'is-urgent' : ''}`} aria-label={`Your hand, ${myCards.length} cards`}>
      <div className="hand-suits" aria-label="Cards grouped into Hearts, Diamonds, Clubs, and Spades">
        {SUITS.map((suit) => {
          const cards = sortedHand.filter((card) => card.suit === suit);

          return (
            <div key={suit} className={`hand-suit ${cards.length ? '' : 'is-empty'}`} data-suit={suit} aria-label={SUIT_LABELS[suit]}>
              <div className="hand-card-fan">
                {cards.map((card) => {
                  const valid = isValidMove(card);
                  const playable = isMyTurn && valid;
                  const cardKey = `${card.suit}-${card.rank}`;

                  return (
                    <button
                      key={cardKey}
                      className={`hand-card ${valid ? 'valid' : ''} ${playable ? 'playable' : ''} ${selectedCardKey === cardKey ? 'is-selected' : ''} ${pendingCard === cardKey ? 'is-pending' : ''}`}
                      data-suit={card.suit}
                      data-rank={card.rank}
                      onClick={() => {
                        if (!playable || pendingCard) return;
                        setSelectedCardKey((current) => current === cardKey ? null : cardKey);
                      }}
                      disabled={!playable || pendingCard !== null}
                      aria-pressed={selectedCardKey === cardKey}
                      aria-label={`${selectedCardKey === cardKey ? 'Selected' : playable ? 'Select' : ''} ${getRankDisplay(card.rank)} of ${SUIT_LABELS[card.suit]}`.trim()}
                    >
                      <img src={getCardSrc(card)} alt="" decoding="async" />
                      <span className="hand-card-corner" aria-hidden="true">
                        <strong>{getRankDisplay(card.rank)}</strong>
                        <SuitIcon suit={card.suit} />
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
        <button
          className={`hand-pass-button ${selectedCard ? 'is-card-confirm' : ''}`}
          onClick={selectedCard ? confirmSelectedCard : onPassTurn}
          disabled={selectedCard ? pendingCard !== null : !isMyTurn || !canPass}
          aria-label={selectedCard
            ? `Play ${getRankDisplay(selectedCard.rank)} of ${SUIT_LABELS[selectedCard.suit]}`
            : isMyTurn && canPass ? 'Pass this turn' : 'Pass is not available'}
        >
          {selectedCard ? (
            <>
              <span>Play</span>
              <strong data-suit={selectedCard.suit}>
                {getRankDisplay(selectedCard.rank)}
                <SuitIcon suit={selectedCard.suit} />
              </strong>
            </>
          ) : 'Pass'}
        </button>
      </div>
    </section>
  );

  const turnControl = (
    <div className={`turn-status ${isMyTurn ? 'is-active' : ''} ${isUrgent ? 'is-urgent' : ''}`}>
      {isMyTurn && <span className="turn-timer">{timeLeft}s</span>}
      <div><strong>{isMyTurn ? 'Your turn' : `${gameState?.currentPlayerName || 'Player'} is playing`}</strong></div>
    </div>
  );

  return (
    <main className="game-screen">
      <div className="game-shell">
        <header className="game-top-bar">
          <div className="game-brand">
            <GameDeskLink onBeforeNavigate={returnToGameDeskSafely} />
            <div><strong>Badam Satti</strong><small>Round {gameState?.round || 1} of {gameState?.maxRounds || 7}</small></div>
          </div>

          {turnControl}

          <div className="game-toolbar">
            <SoundToggle soundOn={soundOn} onSoundChange={onSoundChange} />
            <button className="round-icon-button" onClick={() => setShowHelp(true)} aria-label="How to play">?</button>
            <button className="text-size-button" onClick={nextComfortSize} aria-label={`Change text size. Current size ${COMFORT_BUTTON_LABELS[comfortSize]}`}>{COMFORT_BUTTON_LABELS[comfortSize]}</button>
            <button className="round-icon-button leave-button" onClick={() => setShowLeaveConfirm(true)} aria-label="Leave game">×</button>
          </div>
        </header>

        <div className="table-stage">
          {renderPlayers()}
          {renderBoard()}
          {renderRoundIntro()}
          {roundWinnerName && <div className="round-winning-moment" role="status"><strong>{roundWinnerName} wins the round!</strong></div>}
        </div>
        {renderHand()}
      </div>
      <HelpModal isOpen={showHelp} onClose={() => setShowHelp(false)} comfortSize={comfortSize} onComfortSizeChange={onComfortSizeChange} onReturnToGameDesk={returnToGameDeskSafely} />
      {showLeaveConfirm && <div className="leave-confirm-overlay" role="presentation"><section className="leave-confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="leave-game-title"><span className="leave-confirm-mark" aria-hidden="true">7♥</span><h2 id="leave-game-title">Leave this game?</h2><p>If you pressed Back by mistake, stay here. Your seat and cards are protected during brief disconnects.</p><div><button className="secondary-button" onClick={() => setShowLeaveConfirm(false)}>Stay in game</button><button className="danger-button" onClick={confirmLeave}>Leave game</button></div></section></div>}
    </main>
  );
};

export default GameScreen;
