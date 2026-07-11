import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import GameBoard from './GameBoard';
import type { GameState } from './types';

const state = {
  roomCode: 'ABC123', started: true, finished: false, winnerName: null, dealerName: 'A', currentPlayerName: 'A', isMyTurn: true,
  turnNumber: 1, actionDeadline: Date.now() + 10_000, stockCount: 20,
  piles: { north: [{ rank: 8, suit: 'hearts' }], east: [{ rank: 9, suit: 'clubs' }], south: [], west: [], northWest: [], northEast: [], southEast: [], southWest: [] },
  players: [], myHand: [], handActions: [], pileActions: [{ type: 'move_pile', sourcePileId: 'north', targetPileId: 'east' }],
  suggestedActions: [{ type: 'move_pile', sourcePileId: 'north', targetPileId: 'east' }], lastAction: null,
} satisfies GameState;

describe('GameBoard', () => {
  it('makes a suggested board pile directly tappable', () => {
    const onMove = vi.fn();
    render(<GameBoard state={state} onMovePile={onMove} />);
    screen.getByRole('button', { name: 'Move North pile to East' }).click();
    expect(onMove).toHaveBeenCalledWith({ type: 'move_pile', sourcePileId: 'north', targetPileId: 'east' });
  });
});
