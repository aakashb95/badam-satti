// Rules of the solo games, kept free of React and the clock so they can be tested.
//  - classic ("Solo · 30 cards"): 30 cards, each with its own 30-second
//    clock. A card whose clock runs out counts as missed, is shown as missed
//    for a moment, and then the next card comes up. A wrong tap locks the
//    card for 1.5 s while its clock keeps running.
//  - time-attack: one 60-second clock for the whole run. Match as many cards
//    as you can; each wrong tap takes 3 seconds off the clock.
//  - daily ("Daily Kitchen"): the same 20 cards for everyone today, against a
//    stopwatch. A wrong tap locks the card for 1.5 s. One try a day.
export type SoloMode = 'classic' | 'time-attack' | 'daily';

export const SOLO_CARDS = 30;
export const SOLO_CARD_SECONDS = 30;
export const CARD_MS = SOLO_CARD_SECONDS * 1000;
export const LOCKOUT_MS = 1_500;
export const MISSED_SHOW_MS = 1_200;
export const TIME_ATTACK_SECONDS = 60;
export const TIME_ATTACK_PENALTY_SECONDS = 3;
export const DAILY_CARDS = 20;

interface ModeRules {
  // Cards in the run; Time Attack keeps dealing until its clock runs out.
  cards: number;
  // Clock for each card, or for the whole run.
  cardMs: number | null;
  runMs: number | null;
  lockoutMs: number;
  penaltyMs: number;
}

export const RULES: Record<SoloMode, ModeRules> = {
  classic: { cards: SOLO_CARDS, cardMs: CARD_MS, runMs: null, lockoutMs: LOCKOUT_MS, penaltyMs: 0 },
  // The short pause only shows which picture was wrong; the cost is the 3 s.
  'time-attack': { cards: Infinity, cardMs: null, runMs: TIME_ATTACK_SECONDS * 1000, lockoutMs: 500, penaltyMs: TIME_ATTACK_PENALTY_SECONDS * 1000 },
  daily: { cards: DAILY_CARDS, cardMs: null, runMs: null, lockoutMs: LOCKOUT_MS, penaltyMs: 0 },
};

export interface SoloRun {
  mode: SoloMode;
  phase: 'playing' | 'missed' | 'finished';
  // The card in hand: 1 for the first card. It is also that card's place in
  // the shuffled deck (wrapping round for long Time Attack runs); place 0
  // starts in the middle.
  card: number;
  // Deck place of the middle card: the last card matched.
  centre: number;
  runStartedAt: number;
  cardStartedAt: number;
  missedUntil: number;
  lockedUntil: number;
  // Time Attack: seconds lost to wrong taps, in ms.
  penaltyMs: number;
  matched: number;
  missed: number;
  wrong: number;
  // Time spent on all cards so far, and on matched cards only.
  totalMs: number;
  matchMs: number;
}

export interface SoloResult { matched: number; totalMs: number }

export function startRun(now: number, mode: SoloMode = 'classic'): SoloRun {
  return { mode, phase: 'playing', card: 1, centre: 0, runStartedAt: now, cardStartedAt: now, missedUntil: 0, lockedUntil: 0, penaltyMs: 0, matched: 0, missed: 0, wrong: 0, totalMs: 0, matchMs: 0 };
}

// Time Attack: what is left of the run's clock.
export function runTimeLeft(run: SoloRun, now: number): number {
  const { runMs } = RULES[run.mode];
  if (runMs === null) return Infinity;
  if (run.phase === 'finished') return 0;
  return Math.max(0, runMs - (now - run.runStartedAt) - run.penaltyMs);
}

function nextCard(run: SoloRun, now: number): SoloRun {
  if (run.card >= RULES[run.mode].cards) return { ...run, phase: 'finished', lockedUntil: 0 };
  return { ...run, phase: 'playing', card: run.card + 1, cardStartedAt: now, lockedUntil: 0 };
}

// Moves the run on when time has passed: the run's clock runs out, a card
// times out, or a missed card has been shown for long enough. Returns the
// same run when nothing changed.
export function advance(run: SoloRun, now: number): SoloRun {
  const { cardMs, runMs } = RULES[run.mode];
  if (runMs !== null && run.phase === 'playing' && runTimeLeft(run, now) <= 0) {
    return { ...run, phase: 'finished', lockedUntil: 0, totalMs: runMs };
  }
  if (cardMs !== null && run.phase === 'playing' && now - run.cardStartedAt >= cardMs) {
    return { ...run, phase: 'missed', missed: run.missed + 1, totalMs: run.totalMs + cardMs, missedUntil: now + MISSED_SHOW_MS, lockedUntil: 0 };
  }
  if (run.phase === 'missed' && now >= run.missedUntil) return nextCard(run, now);
  return run;
}

// A tap on a picture of the card in hand. `correct` says whether that picture
// is also on the middle card.
export function tap(run: SoloRun, correct: boolean, now: number): SoloRun {
  const current = advance(run, now);
  if (current.phase !== 'playing' || now < current.lockedUntil) return current;
  const { lockoutMs, penaltyMs } = RULES[current.mode];
  if (!correct) return { ...current, wrong: current.wrong + 1, lockedUntil: now + lockoutMs, penaltyMs: current.penaltyMs + penaltyMs };
  const spent = now - current.cardStartedAt;
  return nextCard({ ...current, matched: current.matched + 1, centre: current.card, totalMs: current.totalMs + spent, matchMs: current.matchMs + spent }, now);
}

// Share of the clock still to run, from 1 down to 0: the card's clock, or
// Time Attack's run clock. Daily Kitchen has no clock and stays at 1.
export function clockFraction(run: SoloRun, now: number): number {
  const { cardMs, runMs } = RULES[run.mode];
  if (run.phase !== 'playing') return run.mode === 'daily' ? 1 : 0;
  if (runMs !== null) return runTimeLeft(run, now) / runMs;
  if (cardMs === null) return 1;
  return Math.max(0, Math.min(1, 1 - (now - run.cardStartedAt) / cardMs));
}

// The best run has the most matches; the faster total time breaks a tie.
export function isBetter(result: SoloResult, best: SoloResult | null): boolean {
  if (!best) return true;
  return result.matched > best.matched || (result.matched === best.matched && result.totalMs < best.totalMs);
}

// Daily Kitchen: today's date on this phone, which picks today's cards.
export function todayKey(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
