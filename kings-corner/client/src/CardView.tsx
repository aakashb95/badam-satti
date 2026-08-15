import { useState } from 'react';
import { getCardSrc, getRankDisplay, SUIT_LABELS, SUIT_SYMBOLS } from './cards';
import type { Card } from './types';

interface Props {
  card: Card;
  className?: string;
  onClick?: () => void;
  label?: string;
}

export default function CardView({ card, className = '', onClick, label }: Props) {
  const [loaded, setLoaded] = useState(false);
  const rank = getRankDisplay(card.rank);
  const symbol = SUIT_SYMBOLS[card.suit];
  const name = `${rank} of ${SUIT_LABELS[card.suit]}`;
  const image = <><span className={`card-fallback ${card.suit === 'hearts' || card.suit === 'diamonds' ? 'red' : ''}`} aria-hidden="true"><span><strong>{rank}</strong><i>{symbol}</i></span><span className="card-fallback-bottom"><strong>{rank}</strong><i>{symbol}</i></span></span><img className={loaded ? 'loaded' : ''} src={getCardSrc(card)} alt={name} draggable={false} onLoad={() => setLoaded(true)} /></>;
  if (!onClick) return <span className={`playing-card ${className}`}>{image}</span>;
  return (
    <button className={`playing-card ${className}`} onClick={onClick} aria-label={label || name}>{image}</button>
  );
}
