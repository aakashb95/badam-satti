import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ResultsScreen from './ResultsScreen';
import type { GameState } from './types';

const state = {
  roomCode: 'ABC123', started: true, finished: true, winnerName: 'Aakash', dealerName: 'Aakash', starterName: 'Aakash', currentPlayerName: 'Aakash', isMyTurn: false,
  turnNumber: 8, actionDeadline: null, stockCount: 12,
  piles: { north: [], east: [], south: [], west: [], northWest: [], northEast: [], southEast: [], southWest: [] },
  players: [
    { name: 'Aakash', connected: true, cardCount: 0, isDealer: true },
    { name: 'Maya', connected: true, cardCount: 3, isDealer: false },
  ],
  myHand: [], handActions: [], pileActions: [], suggestedActions: [], lastAction: null,
} satisfies GameState;

describe('ResultsScreen', () => {
  it('shows Badam-style standings, replay, and return controls to the host', () => {
    const onRestart = vi.fn();
    const onReturn = vi.fn();
    render(<ResultsScreen state={state} username="Aakash" showingDelay={false} onRestart={onRestart} onReturnToLobby={onReturn} onReturnToGameDesk={vi.fn()} />);
    expect(screen.getByRole('heading', { name: 'Aakash rules the table.' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Game Desk — choose a game' })).toHaveAttribute('href', '/');
    screen.getByRole('button', { name: 'Play again →' }).click();
    screen.getByRole('button', { name: 'Return to lobby' }).click();
    expect(onRestart).toHaveBeenCalledOnce();
    expect(onReturn).toHaveBeenCalledOnce();
  });

  it('shows the counting reveal before standings', () => {
    render(<ResultsScreen state={state} username="Maya" showingDelay onRestart={vi.fn()} onReturnToLobby={vi.fn()} onReturnToGameDesk={vi.fn()} />);
    expect(screen.getByRole('heading', { name: 'Cards down.' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Return to lobby' })).not.toBeInTheDocument();
  });
});
