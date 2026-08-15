import type { Card } from './types';

export const CARD_ASSET_VERSION = 'v3';

export const SUIT_LABELS: Record<Card['suit'], string> = {
  hearts: 'Hearts',
  diamonds: 'Diamonds',
  clubs: 'Clubs',
  spades: 'Spades',
};

export const SUIT_SYMBOLS: Record<Card['suit'], string> = {
  hearts: '♥',
  diamonds: '♦',
  clubs: '♣',
  spades: '♠',
};

export function getRankDisplay(rank: number): string {
  if (rank === 1) return 'A';
  if (rank === 11) return 'J';
  if (rank === 12) return 'Q';
  if (rank === 13) return 'K';
  return String(rank);
}

export function getCardFilename(card: Card): string {
  const suitLetters: Record<Card['suit'], string> = {
    hearts: 'H',
    diamonds: 'D',
    clubs: 'C',
    spades: 'S',
  };
  return `${getRankDisplay(card.rank)}${suitLetters[card.suit]}.svg`;
}

export function getCardSrc(card: Card): string {
  return `${import.meta.env.BASE_URL}images/cards/${getCardFilename(card)}?${CARD_ASSET_VERSION}`;
}

export function cardKey(card: Card): string {
  return `${card.rank}:${card.suit}`;
}
