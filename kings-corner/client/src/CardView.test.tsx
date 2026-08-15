import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import CardView from './CardView';

describe('CardView', () => {
  it('shows a readable fallback before the card image loads', () => {
    const { container } = render(<CardView card={{ rank: 12, suit: 'hearts' }} />);
    expect(screen.getByAltText('Q of Hearts')).not.toHaveClass('loaded');
    expect(screen.getByAltText('Q of Hearts')).toHaveAttribute('src', '/kings-corner/images/cards/QH.svg?v3');
    expect(container.querySelector('.card-fallback')).toHaveTextContent('Q♥Q♥');
  });
});
