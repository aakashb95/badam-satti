import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import KitchenCard from './KitchenCard';
import { ITEMS } from './items';
import { initialRotation, itemAt, layoutCard } from './layout';

const card = { id: 8, items: [1, 15, 22, 29, 36, 43, 50, 57 - 1] };

describe('sample items', () => {
  it('has 57 distinct items, one per deck symbol', () => {
    expect(ITEMS).toHaveLength(57);
    expect(new Set(ITEMS.map((item) => item.emoji)).size).toBe(57);
    expect(new Set(ITEMS.map((item) => item.name)).size).toBe(57);
  });
});

describe('card layout', () => {
  it('places every item inside the card without overlapping its neighbours, for many seeds', () => {
    for (let seed = 0; seed < 300; seed += 1) {
      const layout = layoutCard(card.items, `seed-${seed}`);
      expect(layout.map((item) => item.itemId).sort((a, b) => a - b)).toEqual([...card.items].sort((a, b) => a - b));
      for (const item of layout) expect(Math.hypot(item.x, item.y) + item.size / 2).toBeLessThan(91);
      for (let i = 0; i < layout.length; i += 1) {
        for (let j = i + 1; j < layout.length; j += 1) {
          const gap = Math.hypot(layout[i].x - layout[j].x, layout[i].y - layout[j].y) - (layout[i].size + layout[j].size) / 2;
          expect(gap).toBeGreaterThan(0);
        }
      }
    }
  });

  it('finds the tapped item on a turned card, and ignores taps in empty space', () => {
    const layout = layoutCard(card.items, 'turned');
    const target = layout[3];
    // Where the target appears on screen after turning the card 90° clockwise.
    const screenX = -target.y;
    const screenY = target.x;
    expect(itemAt(layout, screenX, screenY, 90)).toBe(target.itemId);
    expect(itemAt(layout, target.x, target.y, 90)).not.toBe(target.itemId);
    expect(itemAt(layout, 0, 98, 0)).toBeNull();
  });
});

describe('KitchenCard gestures', () => {
  function renderCard(onPick = vi.fn()) {
    render(<KitchenCard card={card} seed="gesture" label="Your card" onPick={onPick} />);
    const frame = screen.getByRole('group', { name: 'Your card' });
    frame.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 200, right: 200, bottom: 200, x: 0, y: 0, toJSON: () => ({}) });
    const layout = layoutCard(card.items, `${card.id}:gesture`);
    const rotation = initialRotation(`${card.id}:gesture`);
    const radians = (rotation * Math.PI) / 180;
    const middle = layout[0];
    // Card units map 1:1 to pixels on a 200 px card centred at (100, 100).
    const point = { clientX: 100 + middle.x * Math.cos(radians) - middle.y * Math.sin(radians), clientY: 100 + middle.x * Math.sin(radians) + middle.y * Math.cos(radians) };
    return { frame, onPick, middle, point };
  }

  it('sends the item under a tap', () => {
    const { frame, onPick, middle, point } = renderCard();
    fireEvent.pointerDown(frame, { pointerId: 1, button: 0, ...point });
    fireEvent.pointerUp(frame, { pointerId: 1, ...point });
    expect(onPick).toHaveBeenCalledWith(middle.itemId);
  });

  it('turns the card on a drag and never sends a pick', () => {
    const { frame, onPick } = renderCard();
    const face = frame.querySelector('svg')!;
    const before = face.style.transform;
    fireEvent.pointerDown(frame, { pointerId: 1, button: 0, clientX: 190, clientY: 100 });
    fireEvent.pointerMove(frame, { pointerId: 1, clientX: 100, clientY: 190 });
    fireEvent.pointerUp(frame, { pointerId: 1, clientX: 100, clientY: 190 });
    expect(onPick).not.toHaveBeenCalled();
    expect(face.style.transform).not.toBe(before);
  });

  it('sends nothing while locked out', () => {
    const onPick = vi.fn();
    render(<KitchenCard card={card} seed="gesture" label="Your card" onPick={onPick} disabled />);
    fireEvent.keyDown(screen.getAllByRole('button', { name: ITEMS[card.items[0]].name })[0], { key: 'Enter' });
    expect(onPick).not.toHaveBeenCalled();
  });
});
