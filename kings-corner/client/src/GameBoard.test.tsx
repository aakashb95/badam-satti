import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import GameBoard from './GameBoard';
import type { GameState } from './types';

const state = {
  roomCode: 'ABC123', started: true, finished: false, winnerName: null, dealerName: 'A', starterName: 'A', currentPlayerName: 'A', isMyTurn: true,
  turnNumber: 1, actionDeadline: Date.now() + 20_000, stockCount: 20,
  piles: { north: [{ rank: 8, suit: 'hearts' }], east: [{ rank: 9, suit: 'clubs' }], south: [], west: [], northWest: [], northEast: [], southEast: [], southWest: [] },
  players: [], myHand: [], handActions: [], pileActions: [{ type: 'move_pile', sourcePileId: 'north', targetPileId: 'east' }],
  suggestedActions: [{ type: 'move_pile', sourcePileId: 'north', targetPileId: 'east' }], lastAction: null,
} satisfies GameState;

describe('GameBoard', () => {
  it('makes a suggested board pile directly tappable', () => {
    const onMove = vi.fn();
    const { container } = render(<GameBoard state={state} onMovePile={onMove} />);
    screen.getByRole('button', { name: 'Move North pile to East' }).click();
    expect(onMove).toHaveBeenCalledWith({ type: 'move_pile', sourcePileId: 'north', targetPileId: 'east' });
    expect(container.querySelector('.pile-south .empty-slot')).toHaveTextContent('+');
    expect(container.querySelector('.pile-southWest .empty-slot')).toHaveTextContent('K');
    expect(container.querySelectorAll('.best-move-arrow')).toHaveLength(1);
    expect(container.querySelector('.pile-east')).toHaveClass('pile-recommended-target');
  });

  it('keeps other legal piles tappable without promoting them', () => {
    const onMove = vi.fn();
    const multiMoveState: GameState = {
      ...state,
      pileActions: [
        ...state.pileActions,
        { type: 'move_pile', sourcePileId: 'east', targetPileId: 'south' },
      ],
    };
    const { container } = render(<GameBoard state={multiMoveState} onMovePile={onMove} />);
    screen.getByRole('button', { name: 'Move East pile to South' }).click();
    expect(onMove).toHaveBeenCalledWith({ type: 'move_pile', sourcePileId: 'east', targetPileId: 'south' });
    expect(container.querySelector('.pile-east')).not.toHaveClass('pile-suggested');
    expect(container.querySelector('.pile-east')).toHaveClass('pile-playable');
  });

  it('renders only the base and playable endpoint for a long pile', () => {
    const longPileState: GameState = {
      ...state,
      piles: {
        ...state.piles,
        north: [
          { rank: 10, suit: 'diamonds' },
          { rank: 9, suit: 'clubs' },
          { rank: 8, suit: 'hearts' },
          { rank: 7, suit: 'spades' },
        ],
      },
    };
    const { container } = render(<GameBoard state={longPileState} onMovePile={vi.fn()} />);
    const northPile = container.querySelector('.pile-north');
    expect(northPile?.querySelectorAll('.playing-card')).toHaveLength(2);
    expect(northPile).toHaveTextContent('+2');
    expect(northPile?.querySelector('img[alt="9 of clubs"]')).not.toBeInTheDocument();
    expect(northPile?.querySelector('img[alt="10 of diamonds"]')).toBeInTheDocument();
    expect(northPile?.querySelector('img[alt="7 of spades"]')).toBeInTheDocument();
  });
});
