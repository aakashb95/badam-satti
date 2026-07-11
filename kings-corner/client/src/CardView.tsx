import type { Card } from './types';

const suitCode = { hearts: 'H', diamonds: 'D', clubs: 'C', spades: 'S' } as const;
const rankCode = (rank: number) => ({ 1: 'A', 11: 'J', 12: 'Q', 13: 'K' }[rank] || String(rank));

interface Props {
  card: Card;
  className?: string;
  onClick?: () => void;
  label?: string;
}

export default function CardView({ card, className = '', onClick, label }: Props) {
  const name = `${rankCode(card.rank)} of ${card.suit}`;
  const image = <img src={`/images/cards/${rankCode(card.rank)}${suitCode[card.suit]}.svg`} alt={name} draggable={false} />;
  if (!onClick) return <span className={`playing-card ${className}`}>{image}</span>;
  return (
    <button className={`playing-card ${className}`} onClick={onClick} aria-label={label || name}>{image}</button>
  );
}
