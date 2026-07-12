import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import HelpModal from './HelpModal';

describe('HelpModal', () => {
  it('shows the animated rules guide and closes from its action', () => {
    const onClose = vi.fn();
    const onSizeChange = vi.fn();
    render(<HelpModal open onClose={onClose} comfortSize="standard" onComfortSizeChange={onSizeChange} />);
    expect(screen.getByRole('dialog', { name: 'How to play' })).toBeInTheDocument();
    expect(screen.getByText('A card is drawn for you')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('Only Kings open a corner')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('Go down. Alternate colours.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('Move a whole pile together')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('Use Finish turn when you’re done')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'A++' }));
    expect(onSizeChange).toHaveBeenCalledWith('extra-large');
    fireEvent.click(screen.getByRole('button', { name: 'A+++' }));
    expect(onSizeChange).toHaveBeenCalledWith('maximum');
    fireEvent.click(screen.getByRole('button', { name: /Got it/ }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
