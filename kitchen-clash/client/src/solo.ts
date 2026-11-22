// Rules of a solo run, kept free of React and the clock so they can be tested:
// 30 cards, each with its own 30-second clock. A match moves on to the next
// card. A card whose clock runs out counts as missed, is shown as missed for
// a moment, and then the next card comes up. A wrong tap locks the card for
// 1.5 s while its clock keeps running.
export const SOLO_CARDS = 30;
export const SOLO_CARD_SECONDS = 30;
export const CARD_MS = SOLO_CARD_SECONDS * 1000;
export const LOCKOUT_MS = 1_500;
export const MISSED_SHOW_MS = 1_200;

export interface SoloRun {
  phase: 'playing' | 'missed' | 'finished';
  // The card in hand: 1 for the first card, SOLO_CARDS for the last. It is
  // also that card's place in the shuffled deck; place 0 starts in the middle.
  card: number;
  // Deck place of the middle card: the last card matched.
  centre: number;
  cardStartedAt: number;
  missedUntil: number;
  lockedUntil: number;
  matched: number;
  missed: number;
  wrong: number;
  // Time spent on all cards so far, and on matched cards only.
  totalMs: number;
  matchMs: number;
}

export interface SoloResult { matched: number; totalMs: number }

export function startRun(now: number): SoloRun {
  return { phase: 'playing', card: 1, centre: 0, cardStartedAt: now, missedUntil: 0, lockedUntil: 0, matched: 0, missed: 0, wrong: 0, totalMs: 0, matchMs: 0 };
}

function nextCard(run: SoloRun, now: number): SoloRun {
  if (run.card >= SOLO_CARDS) return { ...run, phase: 'finished', lockedUntil: 0 };
  return { ...run, phase: 'playing', card: run.card + 1, cardStartedAt: now, lockedUntil: 0 };
}

// Moves the run on when time has passed: a card times out, or a missed card
// has been shown for long enough. Returns the same run when nothing changed.
export function advance(run: SoloRun, now: number): SoloRun {
  if (run.phase === 'playing' && now - run.cardStartedAt >= CARD_MS) {
    return { ...run, phase: 'missed', missed: run.missed + 1, totalMs: run.totalMs + CARD_MS, missedUntil: now + MISSED_SHOW_MS, lockedUntil: 0 };
  }
  if (run.phase === 'missed' && now >= run.missedUntil) return nextCard(run, now);
  return run;
}

// A tap on a picture of the card in hand. `correct` says whether that picture
// is also on the middle card.
export function tap(run: SoloRun, correct: boolean, now: number): SoloRun {
  const current = advance(run, now);
  if (current.phase !== 'playing' || now < current.lockedUntil) return current;
  if (!correct) return { ...current, wrong: current.wrong + 1, lockedUntil: now + LOCKOUT_MS };
  const spent = now - current.cardStartedAt;
  return nextCard({ ...current, matched: current.matched + 1, centre: current.card, totalMs: current.totalMs + spent, matchMs: current.matchMs + spent }, now);
}

// Share of the card's clock still to run, from 1 down to 0.
export function clockFraction(run: SoloRun, now: number): number {
  if (run.phase !== 'playing') return 0;
  return Math.max(0, Math.min(1, 1 - (now - run.cardStartedAt) / CARD_MS));
}

// The best run has the most matches; the faster total time breaks a tie.
export function isBetter(result: SoloResult, best: SoloResult | null): boolean {
  if (!best) return true;
  return result.matched > best.matched || (result.matched === best.matched && result.totalMs < best.totalMs);
}
