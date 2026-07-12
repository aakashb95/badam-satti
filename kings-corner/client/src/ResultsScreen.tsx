import type { GameState } from './types';
import GameDeskLink from './GameDeskLink';

interface Props {
  state: GameState;
  username: string;
  showingDelay: boolean;
  onRestart: () => void;
  onReturnToLobby: () => void;
  onReturnToGameDesk: () => Promise<void>;
}

export default function ResultsScreen({ state, username, showingDelay, onRestart, onReturnToLobby, onReturnToGameDesk }: Props) {
  if (showingDelay) {
    return <main className="shell results-reveal-screen"><div className="results-reveal"><GameDeskLink onBeforeNavigate={onReturnToGameDesk} className="results-game-desk" /><p className="eyebrow">Game complete</p><div className="reveal-card"><span>K</span><i>♛</i></div><h1>Cards down.</h1><p>Counting the table</p><div className="loading-dots"><span /><span /><span /></div></div></main>;
  }

  const won = state.winnerName === username;
  const standings = [...state.players].sort((left, right) => {
    if (left.name === state.winnerName) return -1;
    if (right.name === state.winnerName) return 1;
    return left.cardCount - right.cardCount;
  });
  const isHost = state.players[0]?.name === username;

  return (
    <main className="shell results-screen">
      <section className="results-shell">
        <GameDeskLink onBeforeNavigate={onReturnToGameDesk} className="results-game-desk" />
        <header className="results-header">
          {won && <div className="winner-confetti" aria-hidden="true">{Array.from({ length: 14 }, (_, index) => <span key={index} />)}</div>}
          <p className="eyebrow">Game results</p>
          <h1><em>{state.winnerName}</em> rules the table.</h1>
          <p>{won ? 'Every card found its place. Nicely played.' : 'A clean hand takes the crown. Ready for another?'}</p>
        </header>
        <div className="standings">
          <div className="section-heading"><h2>Final standings</h2><span>Cards remaining</span></div>
          <div className="scores-list">{standings.map((player, index) => (
            <div className={`score-row ${player.name === state.winnerName ? 'winner' : ''}`} key={player.name}>
              <span className="score-rank">{String(index + 1).padStart(2, '0')}</span>
              <div className="score-player"><strong>{player.name}</strong><small>{player.name === state.winnerName ? 'Table champion' : 'Well played'}</small></div>
              <span className="cards-left"><strong>{player.cardCount}</strong> cards</span>
            </div>
          ))}</div>
        </div>
        <div className="game-over-actions">
          {isHost && <button className="result-primary" onClick={onRestart}>Play again <span>→</span></button>}
          <button className={isHost ? 'result-secondary' : 'result-primary'} onClick={onReturnToLobby}>Return to lobby</button>
        </div>
      </section>
    </main>
  );
}
