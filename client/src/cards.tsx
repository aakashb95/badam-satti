import React from 'react';
import { Card } from './types';

// Bump whenever the card SVGs change so cached art is refetched.
export const CARD_ASSET_VERSION = 'v8';

export const SUIT_LABELS: Record<Card['suit'], string> = {
  hearts: 'Hearts',
  diamonds: 'Diamonds',
  clubs: 'Clubs',
  spades: 'Spades',
};

export const getRankDisplay = (rank: number): string => {
  if (rank === 1) return 'A';
  if (rank === 11) return 'J';
  if (rank === 12) return 'Q';
  if (rank === 13) return 'K';
  return rank.toString();
};

export const getCardFilename = (card: Card): string => {
  const suitLetters: Record<Card['suit'], string> = { hearts: 'H', diamonds: 'D', clubs: 'C', spades: 'S' };
  const rankMap: Record<number, string> = { 1: 'A', 11: 'J', 12: 'Q', 13: 'K' };
  return `${rankMap[card.rank] || card.rank}${suitLetters[card.suit]}.svg`;
};

export const getCardSrc = (card: Card): string =>
  `${import.meta.env.BASE_URL}images/cards/${getCardFilename(card)}?${CARD_ASSET_VERSION}`;

// Pip silhouettes shared by the board piles, move bubbles, and hand labels.
// Clubs and spades are drawn for small-size distinguishability: a club is
// "three separated dots" and a spade is "a pointed tip with a flared tail" —
// cues that survive a 12px render. Keep these in sync with the generated
// card SVGs in client/scripts/generate-cards.mjs.
const SUIT_ICON_PATHS: Record<Card['suit'], { viewBox: string; body: React.ReactNode }> = {
  hearts: {
    viewBox: '-30 -24 60 64',
    body: <path d="M0-7C-7-18-23-12-23 3c0 14 15 23 23 31C8 26 23 17 23 3 23-12 7-18 0-7Z" />,
  },
  diamonds: {
    viewBox: '-24 -29 48 58',
    body: <path d="M0-23 16 0 0 23-16 0Z" />,
  },
  clubs: {
    viewBox: '-52 -52 104 116',
    body: (
      <path d="M-21-26a21 21 0 1 0 42 0 21 21 0 1 0-42 0ZM-48 12a21 21 0 1 0 42 0 21 21 0 1 0-42 0ZM6 12a21 21 0 1 0 42 0 21 21 0 1 0-42 0ZM0 10 10 58H-10Z" />
    ),
  },
  spades: {
    viewBox: '-40 -52 80 104',
    body: (
      <>
        <path d="M0-46C8-30 33-16 33 6 33 20 23 28 14 28 9 28 5 26 3 22L-3 22C-5 26-9 28-14 28-23 28-33 20-33 6-33-16-8-30 0-46Z" />
        <path d="M-3 22C-3 32-8 40-16 46L16 46C8 40 3 32 3 22Z" />
      </>
    ),
  },
};

export const SuitIcon: React.FC<{ suit: Card['suit']; className?: string }> = ({ suit, className = '' }) => {
  const icon = SUIT_ICON_PATHS[suit];
  return (
    <svg className={`suit-icon ${className}`} viewBox={icon.viewBox} aria-hidden="true" focusable="false">
      {icon.body}
    </svg>
  );
};
