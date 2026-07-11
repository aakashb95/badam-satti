import { useState } from 'react';
import type { Card } from './types';

const suitCode = { hearts: 'H', diamonds: 'D', clubs: 'C', spades: 'S' } as const;
const rankCode = (rank: number) => ({ 1: 'A', 11: 'J', 12: 'Q', 13: 'K' }[rank] || String(rank));
const suitSymbol = { hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠' } as const;

interface Props {
  card: Card;
  className?: string;
  onClick?: () => void;
  label?: string;
}

export default function CardView({ card, className = '', onClick, label }: Props) {
  const [loaded, setLoaded] = useState(false);
  const name = `${rankCode(card.rank)} of ${card.suit}`;
  const image = <><span className={`card-fallback ${card.suit === 'hearts' || card.suit === 'diamonds' ? 'red' : ''}`} aria-hidden="true"><strong>{rankCode(card.rank)}</strong><i>{suitSymbol[card.suit]}</i></span><img className={loaded ? 'loaded' : ''} src={`${import.meta.env.BASE_URL}images/cards/${rankCode(card.rank)}${suitCode[card.suit]}.svg`} alt={name} draggable={false} onLoad={() => setLoaded(true)} /></>;
  if (!onClick) return <span className={`playing-card ${className}`}>{image}</span>;
  return (
    <button className={`playing-card ${className}`} onClick={onClick} aria-label={label || name}>{image}</button>
  );
}
