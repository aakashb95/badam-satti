const crypto = require('crypto');

// Builds the projective plane of prime order n: n² + n + 1 cards, each with
// n + 1 items, where every pair of cards shares exactly one item. Order 7
// gives the 57-card, 8-items-per-card Spot It deck.
function createDeck(order = 7) {
  const n = order;
  const cards = [];
  cards.push(Array.from({ length: n + 1 }, (_, index) => index));
  for (let i = 0; i < n; i += 1) {
    cards.push([0, ...Array.from({ length: n }, (_, j) => n + 1 + i * n + j)]);
  }
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < n; j += 1) {
      cards.push([i + 1, ...Array.from({ length: n }, (_, k) => n + 1 + k * n + ((i * k + j) % n))]);
    }
  }
  return cards.map((items, id) => ({ id, items }));
}

function shuffle(values, randomInt = crypto.randomInt) {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(index + 1);
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

function sharedItem(first, second) {
  return first.items.find((item) => second.items.includes(item));
}

module.exports = { createDeck, shuffle, sharedItem };
