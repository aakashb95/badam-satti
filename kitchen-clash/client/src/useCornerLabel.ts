import { useLayoutEffect, useRef, useState } from 'react';

// The middle card's "Look here" label sits in the board's top-left corner,
// beside the round card. Whether the full text fits there depends on the
// screen, the text size and the card size, so measure it: when the full
// label would touch the card, show only its icon.
export function useCornerLabel() {
  const slotRef = useRef<HTMLElement | null>(null);
  const [iconOnly, setIconOnly] = useState(false);

  useLayoutEffect(() => {
    const slot = slotRef.current;
    if (!slot) return undefined;
    const check = () => {
      const label = slot.querySelector('.slot-label');
      const text = slot.querySelector<HTMLElement>('.slot-label .label-text');
      const card = slot.querySelector('.kitchen-card');
      if (!label || !text || !card) return;
      // Measure with the text shown, then decide.
      const hidden = text.style.display;
      text.style.display = 'inline';
      const l = label.getBoundingClientRect();
      text.style.display = hidden;
      const c = card.getBoundingClientRect();
      const cx = c.left + c.width / 2;
      const cy = c.top + c.height / 2;
      const nearestX = Math.max(l.left, Math.min(cx, l.right));
      const nearestY = Math.max(l.top, Math.min(cy, l.bottom));
      setIconOnly(Math.hypot(nearestX - cx, nearestY - cy) < c.width / 2 + 2);
    };
    check();
    const observer = new ResizeObserver(check);
    observer.observe(slot);
    slot.querySelectorAll('.slot-label, .kitchen-card').forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  });

  return { slotRef, labelClass: iconOnly ? 'slot-label icon-only' : 'slot-label' };
}
