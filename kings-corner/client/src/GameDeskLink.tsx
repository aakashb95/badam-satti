import { useState, type MouseEvent } from 'react';

interface Props {
  onBeforeNavigate?: () => void | Promise<void>;
  className?: string;
}

export default function GameDeskLink({ onBeforeNavigate, className = '' }: Props) {
  const [isLeaving, setIsLeaving] = useState(false);

  const handleClick = async (event: MouseEvent<HTMLAnchorElement>) => {
    if (!onBeforeNavigate || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

    event.preventDefault();
    if (isLeaving) return;
    setIsLeaving(true);
    try {
      await onBeforeNavigate();
    } finally {
      window.location.assign('/');
    }
  };

  return (
    <a className={`game-desk-link ${className}`.trim()} href="/" aria-label="Game Desk — choose a game" aria-busy={isLeaving || undefined} onClick={handleClick}>
      <span className="game-desk-mark" aria-hidden="true">♣</span>
      <span className="game-desk-wordmark">Game Desk</span>
    </a>
  );
}
