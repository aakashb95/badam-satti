import CardView from './CardView';
import type { GameState, MovePileAction, PileId } from './types';

const pileNames: Record<PileId, string> = {
  north: 'North', east: 'East', south: 'South', west: 'West',
  northWest: 'King corner', northEast: 'King corner', southEast: 'King corner', southWest: 'King corner',
};

const layout: PileId[] = ['northWest', 'north', 'northEast', 'west', 'east', 'southWest', 'south', 'southEast'];
const cornerIds = new Set<PileId>(['northWest', 'northEast', 'southEast', 'southWest']);

interface Props { state: GameState; onMovePile: (action: MovePileAction) => void }

export default function GameBoard({ state, onMovePile }: Props) {
  const recommendedAction = state.suggestedActions[0];
  const actionFor = (pileId: PileId) => state.pileActions.find(
    (action): action is MovePileAction => action.type === 'move_pile' && action.sourcePileId === pileId,
  );
  const recommendationFor = (pileId: PileId) => state.suggestedActions.find(
    (action): action is MovePileAction => action.type === 'move_pile' && action.sourcePileId === pileId,
  );

  return (
    <section className="tableau" aria-label="King's Corner board">
      <div className="stock-area">
        <div className={`stock ${state.stockCount === 0 ? 'empty' : ''}`} aria-label={`${state.stockCount} cards in stock`}>
          {state.stockCount > 0 && <span className="stock-mark">K</span>}
        </div>
        <span>{state.stockCount} in stock</span>
      </div>
      {layout.map((pileId) => {
        const cards = state.piles[pileId];
        const recommendation = recommendationFor(pileId);
        const action = recommendation || actionFor(pileId);
        const visibleCards = cards.length <= 1
          ? cards.map((card) => ({ card, position: 'single' }))
          : [
              { card: cards[0], position: 'base' },
              { card: cards[cards.length - 1], position: 'top' },
            ];
        return (
          <div key={pileId} className={`pile pile-${pileId} ${action ? 'pile-playable' : ''} ${recommendation ? 'pile-suggested' : ''} ${recommendedAction?.targetPileId === pileId ? 'pile-recommended-target' : ''}`} data-card-count={cards.length}>
            <button
              className="pile-hitbox"
              disabled={!action}
              onClick={() => action && onMovePile(action)}
              aria-label={action ? `Move ${pileNames[pileId]} pile to ${pileNames[action.targetPileId]}` : pileNames[pileId]}
            >
              {cards.length === 0 ? <span className="empty-slot">{cornerIds.has(pileId) ? 'K' : '+'}</span> : visibleCards.map(({ card, position }) => (
                <span className={`stacked-card stack-position-${position}`} key={`${card.rank}-${card.suit}-${position}`}>
                  <CardView card={card} className={`pile-card-${position}`} />
                </span>
              ))}
              {cards.length > 2 && <span className="hidden-card-count" aria-label={`${cards.length - 2} cards hidden between endpoints`}>+{cards.length - 2}</span>}
            </button>
            {recommendation && <><span className="best-move-arrow pile-arrow" aria-hidden="true">↓</span><span className="move-hint">Helpful move →</span></>}
          </div>
        );
      })}
    </section>
  );
}
