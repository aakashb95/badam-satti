import { describe, expect, it } from 'vitest';
import { advance, CARD_MS, clockFraction, isBetter, LOCKOUT_MS, MISSED_SHOW_MS, SOLO_CARDS, startRun, tap } from './solo';

describe('solo run', () => {
  it('times a card out after 30 s, shows it as missed, then deals the next card with a fresh clock', () => {
    let run = startRun(1_000);
    expect(advance(run, 1_000 + CARD_MS - 1)).toBe(run);
    run = advance(run, 1_000 + CARD_MS);
    expect(run).toMatchObject({ phase: 'missed', card: 1, centre: 0, missed: 1, matched: 0, totalMs: CARD_MS });
    // No tap counts while the missed card is shown.
    expect(tap(run, true, 1_000 + CARD_MS + 10)).toBe(run);
    const dealtAt = 1_000 + CARD_MS + MISSED_SHOW_MS;
    run = advance(run, dealtAt);
    expect(run).toMatchObject({ phase: 'playing', card: 2, centre: 0, cardStartedAt: dealtAt });
    expect(clockFraction(run, dealtAt + CARD_MS / 4)).toBeCloseTo(0.75);
  });

  it('keeps the card clock running through a wrong-tap lockout', () => {
    let run = startRun(0);
    run = tap(run, false, CARD_MS - 500);
    expect(run).toMatchObject({ wrong: 1, lockedUntil: CARD_MS - 500 + LOCKOUT_MS, cardStartedAt: 0 });
    // A correct tap during the lockout does not count.
    expect(tap(run, true, CARD_MS - 100).matched).toBe(0);
    // The card times out at 30 s even though the lockout has not ended.
    expect(advance(run, CARD_MS)).toMatchObject({ phase: 'missed', missed: 1 });
    // A tap that arrives after the clock ran out is a miss, not a match.
    expect(tap(run, true, CARD_MS + 1)).toMatchObject({ phase: 'missed', matched: 0, missed: 1 });
  });

  it('ends after exactly 30 cards and counts matches, misses and time', () => {
    let now = 0;
    let run = startRun(now);
    const centres: number[] = [];
    for (let card = 1; card <= SOLO_CARDS; card += 1) {
      expect(run).toMatchObject({ phase: 'playing', card });
      centres.push(run.centre);
      if (card % 3 === 0) {
        // Every third card times out.
        now += CARD_MS;
        run = advance(run, now);
        now += MISSED_SHOW_MS;
        run = advance(run, now);
      } else {
        now += 2_000;
        run = tap(run, true, now);
      }
    }
    expect(run).toMatchObject({ phase: 'finished', matched: 20, missed: 10, totalMs: 20 * 2_000 + 10 * CARD_MS, matchMs: 20 * 2_000 });
    // A matched card becomes the middle card; a missed card does not.
    expect(centres.slice(0, 5)).toEqual([0, 1, 2, 2, 4]);
    expect(advance(run, now + 10 * CARD_MS)).toBe(run);
    expect(tap(run, true, now + 1)).toBe(run);
  });

  it('ranks results by matches, then by the faster total time', () => {
    expect(isBetter({ matched: 1, totalMs: 900_000 }, null)).toBe(true);
    expect(isBetter({ matched: 21, totalMs: 500_000 }, { matched: 20, totalMs: 100_000 })).toBe(true);
    expect(isBetter({ matched: 20, totalMs: 99_000 }, { matched: 20, totalMs: 100_000 })).toBe(true);
    expect(isBetter({ matched: 20, totalMs: 100_000 }, { matched: 20, totalMs: 100_000 })).toBe(false);
    expect(isBetter({ matched: 19, totalMs: 10_000 }, { matched: 20, totalMs: 100_000 })).toBe(false);
  });
});
