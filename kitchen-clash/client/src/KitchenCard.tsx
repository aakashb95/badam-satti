import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { ITEMS } from './items';
import { initialRotation, itemAt, layoutCard, type PictureSize } from './layout';
import type { Card } from './types';

// A touch that moves further than this turns the card instead of tapping.
const DRAG_THRESHOLD_PX = 10;

interface Props {
  card: Card;
  seed: string;
  label: string;
  // Called when the player taps an item. Omit for a card that only turns.
  onPick?: (itemId: number) => void;
  // Called when someone taps (not drags) a card that takes no picks.
  onTapAside?: () => void;
  // Changes when the player should be pointed at this card.
  nudge?: number;
  // Cards in this player's pile, this one included. Shown as card edges
  // stacked under the card and as a number.
  pile?: number;
  disabled?: boolean;
  shake?: number;
  // The item the server judged wrong, marked until the lockout ends. It only
  // ever says "not this one".
  wrongItemId?: number | null;
  // Share of the lockout still to run, from 1 down to 0.
  lockFraction?: number;
  // The player's size setting, which also grows the pictures.
  pictureSize?: PictureSize;
}

interface Drag { pointerId: number; startX: number; startY: number; startAngle: number; startRotation: number; moved: boolean }

export default function KitchenCard({ card, seed, label, onPick, onTapAside, disabled = false, shake = 0, nudge = 0, pile, wrongItemId = null, lockFraction = 0, pictureSize = 'normal' }: Props) {
  const frameRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const layout = useMemo(() => layoutCard(card.items, `${card.id}:${seed}`, pictureSize), [card.id, card.items, seed, pictureSize]);
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
    if (!onPick) {
      onTapAside?.();
      return;
    }
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
    <div className={`kitchen-card-wrap${nudge ? ' nudge' : ''}`} key={nudge || undefined}>
      <div
        ref={frameRef}
        className={`kitchen-card${onPick ? ' is-yours' : ''}${disabled ? ' is-disabled' : ''}`}
        role="group"
        aria-label={label}
        data-card-id={card.id}
        data-stack={pile === undefined ? undefined : Math.min(4, Math.ceil((pile - 1) / 4))}
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
                {wrongItemId === item.itemId && <path className="wrong-mark" data-wrong-mark transform={`rotate(${-rotation})`} d="M-9 -9 L9 9 M9 -9 L-9 9" />}
              </g>
            );
          })}
        </svg>
        {lockFraction > 0 && (
          <svg className="lock-ring" viewBox="-100 -100 200 200" aria-hidden="true">
            <circle r="97" pathLength={100} strokeDasharray="100" strokeDashoffset={100 - lockFraction * 100} />
          </svg>
        )}
      </div>
      {pile !== undefined && <p className="pile-count" aria-label={`${pile} ${pile === 1 ? 'card' : 'cards'} left`}><span aria-hidden="true">{pile}</span></p>}
      <button type="button" className="turn-button" aria-label={`Turn ${label.toLowerCase()}`} onClick={() => setRotation((value) => value + 45)}>↻</button>
    </div>
  );
}
