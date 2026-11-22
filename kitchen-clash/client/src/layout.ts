// Card geometry in SVG units: the card is a circle of radius 100 centred on
// (0, 0). One item sits in the middle and seven around a ring. The ring is
// turned by a random angle and each item gets its own size and rotation, so
// the same item rarely looks the same on two cards.
export interface PlacedItem { itemId: number; x: number; y: number; size: number; rotation: number }

// The size setting (A, A+, A++) grows the pictures, not only the text. Larger
// pictures sit on a slightly tighter ring with less jitter, so every picture
// still fits inside the plate's rim without touching its neighbours.
export type PictureSize = 'normal' | 'large' | 'larger';
const GEOMETRY: Record<PictureSize, { ringRadius: number; maxSize: number; minScale: number; jitter: number }> = {
  normal: { ringRadius: 65, maxSize: 44, minScale: 0.66, jitter: 3 },
  large: { ringRadius: 64, maxSize: 48, minScale: 0.7, jitter: 2 },
  larger: { ringRadius: 63, maxSize: 51, minScale: 0.74, jitter: 1 },
};

function seededRandom(seed: string) {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) hash = Math.imul(hash ^ seed.charCodeAt(index), 16777619);
  return () => {
    hash = Math.imul(hash ^ (hash >>> 15), 2246822507);
    hash = Math.imul(hash ^ (hash >>> 13), 3266489909);
    hash ^= hash >>> 16;
    return (hash >>> 0) / 4294967296;
  };
}

export function layoutCard(items: number[], seed: string, pictureSize: PictureSize = 'normal'): PlacedItem[] {
  const { ringRadius, maxSize, minScale, jitter } = GEOMETRY[pictureSize];
  const random = seededRandom(seed);
  const order = [...items];
  for (let index = order.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [order[index], order[swap]] = [order[swap], order[index]];
  }
  const ringTurn = random() * Math.PI * 2;
  const ringCount = order.length - 1;
  return order.map((itemId, index) => {
    const angle = ringTurn + ((index - 1) / ringCount) * Math.PI * 2;
    const radius = index === 0 ? 0 : ringRadius;
    return {
      itemId,
      x: Math.cos(angle) * radius + (random() - 0.5) * 2 * jitter,
      y: Math.sin(angle) * radius + (random() - 0.5) * 2 * jitter,
      size: maxSize * (minScale + random() * (1 - minScale)),
      rotation: random() * 360,
    };
  });
}

export function initialRotation(seed: string) {
  return Math.floor(seededRandom(`${seed}:turn`)() * 8) * 45;
}

// Which item a tap lands on. The point is relative to the card centre in card
// units, as seen on screen with the card turned by `rotation` degrees. A tap
// in empty space, away from every item, counts as nothing.
export function itemAt(layout: PlacedItem[], x: number, y: number, rotation: number): number | null {
  const radians = (-rotation * Math.PI) / 180;
  const cardX = x * Math.cos(radians) - y * Math.sin(radians);
  const cardY = x * Math.sin(radians) + y * Math.cos(radians);
  let best: PlacedItem | null = null;
  let bestDistance = Infinity;
  for (const item of layout) {
    const distance = Math.hypot(item.x - cardX, item.y - cardY);
    if (distance < bestDistance) {
      best = item;
      bestDistance = distance;
    }
  }
  return best && bestDistance <= best.size * 0.6 + 6 ? best.itemId : null;
}
