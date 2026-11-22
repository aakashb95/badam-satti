import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { ITEMS } from './items';
import { initialRotation, itemAt, layoutCard } from './layout';
import type { Card } from './types';

// A touch that moves further than this turns the card instead of tapping.
const DRAG_THRESHOLD_PX = 10;

interface Props {
  card: Card;
  seed: string;
  label: string;
  // Called when the player taps an item. Omit for a card that only turns.
  onPick?: (itemId: number) => void;
  disabled?: boolean;
  shake?: number;
}

interface Drag { pointerId: number; startX: number; startY: number; startAngle: number; startRotation: number; moved: boolean }

export default function KitchenCard({ card, seed, label, onPick, disabled = false, shake = 0 }: Props) {
  const frameRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const layout = useMemo(() => layoutCard(card.items, `${card.id}:${seed}`), [card.id, card.items, seed]);
  const [rotation, setRotation] = useState(() => initialRotation(`${card.id}:${seed}`));
  const [dragging, setDragging] = useState(false);
  const [pressed, setPressed] = useState<{ itemId: number; key: number } | null>(null);

  useEffect(() => {
    setRotation(initialRotation(`${card.id}:${seed}`));
    setPressed(null);
  }, [card.id, seed]);

  const centreOf = () => {
    const rect = frameRef.current!.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, radius: rect.width / 2 };
  };
  const angleTo = (x: number, y: number) => {
    const centre = centreOf();
    return (Math.atan2(y - centre.y, x - centre.x) * 180) / Math.PI;
  };

  const pick = (itemId: number) => {
    if (!onPick || disabled) return;
    // Every tap gets the same neutral press, so the card never hints at the answer.
    setPressed({ itemId, key: Date.now() });
    onPick(itemId);
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || dragRef.current) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    dragRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, startAngle: angleTo(event.clientX, event.clientY), startRotation: rotation, moved: false };
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (!drag.moved && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > DRAG_THRESHOLD_PX) {
      drag.moved = true;
      setDragging(true);
    }
    if (drag.moved) setRotation(drag.startRotation + angleTo(event.clientX, event.clientY) - drag.startAngle);
  };
  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setDragging(false);
    if (drag.moved) return;
    const centre = centreOf();
    const scale = 100 / centre.radius;
    const itemId = itemAt(layout, (event.clientX - centre.x) * scale, (event.clientY - centre.y) * scale, rotation);
    if (itemId !== null) pick(itemId);
  };
  const onPointerCancel = () => {
    dragRef.current = null;
    setDragging(false);
  };
  const onItemKey = (event: KeyboardEvent<SVGGElement>, itemId: number) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    pick(itemId);
  };

  return (
    <div className="kitchen-card-wrap">
      <div
        ref={frameRef}
        className={`kitchen-card${onPick ? ' is-yours' : ''}${disabled ? ' is-disabled' : ''}`}
        role="group"
        aria-label={label}
        data-card-id={card.id}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
      >
        <svg
          key={shake}
          className={`kitchen-card-face${shake ? ' shake' : ''}`}
          viewBox="-100 -100 200 200"
          style={{ transform: `rotate(${rotation}deg)`, transition: dragging ? 'none' : undefined }}
        >
          <circle className="card-plate" r="97" />
          <circle className="card-rim" r="91" />
          {layout.map((item) => {
            const art = ITEMS[item.itemId];
            return (
              <g
                key={item.itemId}
                transform={`translate(${item.x} ${item.y})`}
                role={onPick ? 'button' : 'img'}
                tabIndex={onPick && !disabled ? 0 : undefined}
                aria-label={art.name}
                aria-disabled={onPick ? disabled : undefined}
                data-item-id={item.itemId}
                onKeyDown={onPick ? (event) => onItemKey(event, item.itemId) : undefined}
              >
                {pressed?.itemId === item.itemId && <circle key={pressed.key} className="press-ring" r={item.size * 0.62} />}
                <text className="card-item" fontSize={item.size} transform={`rotate(${item.rotation})`} textAnchor="middle" dominantBaseline="central">{art.emoji}</text>
              </g>
            );
          })}
        </svg>
      </div>
      <button type="button" className="turn-button" aria-label={`Turn ${label.toLowerCase()}`} onClick={() => setRotation((value) => value + 45)}>↻</button>
    </div>
  );
}
