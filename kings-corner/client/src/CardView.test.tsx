import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import CardView from './CardView';

describe('CardView', () => {
  it('shows a readable fallback before the card image loads', () => {
    const { container } = render(<CardView card={{ rank: 12, suit: 'hearts' }} />);
    expect(screen.getByAltText('Q of hearts')).not.toHaveClass('loaded');
    expect(container.querySelector('.card-fallback')).toHaveTextContent('Q♥');
  });
});
