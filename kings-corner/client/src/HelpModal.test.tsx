import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import HelpModal from './HelpModal';

describe('HelpModal', () => {
  it('shows the animated rules guide and closes from its action', () => {
    const onClose = vi.fn();
    const onSizeChange = vi.fn();
    render(<HelpModal open onClose={onClose} comfortSize="standard" onComfortSizeChange={onSizeChange} />);
    expect(screen.getByRole('dialog', { name: 'How to play' })).toBeInTheDocument();
    expect(screen.getByText('Move complete piles')).toBeInTheDocument();
    screen.getByRole('button', { name: 'A++' }).click();
    expect(onSizeChange).toHaveBeenCalledWith('extra-large');
    screen.getByRole('button', { name: 'A+++' }).click();
    expect(onSizeChange).toHaveBeenCalledWith('maximum');
    screen.getByRole('button', { name: 'Okay, let’s play' }).click();
    expect(onClose).toHaveBeenCalledOnce();
  });
});
