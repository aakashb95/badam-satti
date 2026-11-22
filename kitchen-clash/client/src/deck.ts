import type { Card } from './types';

// The same order-7 deck the server builds (server/deck.js): 57 cards of 8
// items, every pair sharing exactly one. Single-player mode deals from it on
// the phone.
export function createDeck(n = 7): Card[] {
  const cards: number[][] = [Array.from({ length: n + 1 }, (_, index) => index)];
  for (let i = 0; i < n; i += 1) cards.push([0, ...Array.from({ length: n }, (_, j) => n + 1 + i * n + j)]);
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < n; j += 1) cards.push([i + 1, ...Array.from({ length: n }, (_, k) => n + 1 + k * n + ((i * k + j) % n))]);
  }
  return cards.map((items, id) => ({ id, items }));
}

export function shuffled<T>(values: T[]): T[] {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    [result[index], result[swap]] = [result[swap], result[index]];
  }
  return result;
}
