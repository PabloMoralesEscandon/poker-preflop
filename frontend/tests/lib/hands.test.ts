import { describe, expect, it } from 'vitest';

import {
  ALL_HANDS,
  cardsForNotation,
  combosOf,
  gridDistance,
  gridIndexOf,
  handTypeOf,
  isHandNotation,
  notationAt,
  RANKS,
} from '@/lib/hands';

describe('hand notation', () => {
  it('produces exactly the 169 distinct hands', () => {
    expect(ALL_HANDS).toHaveLength(169);
    expect(new Set(ALL_HANDS).size).toBe(169);
  });

  it('splits into 13 pairs, 78 suited and 78 offsuit', () => {
    const counts = { pair: 0, suited: 0, offsuit: 0 };
    for (const hand of ALL_HANDS) counts[handTypeOf(hand)] += 1;
    expect(counts).toEqual({ pair: 13, suited: 78, offsuit: 78 });
  });

  it('totals 1326 combos', () => {
    const total = ALL_HANDS.reduce((sum, hand) => sum + combosOf(hand), 0);
    expect(total).toBe(1326);
  });

  it('puts pairs on the diagonal, suited above it, offsuit below it', () => {
    expect(notationAt(0, 0)).toBe('AA');
    expect(notationAt(12, 12)).toBe('22');
    // Above the diagonal (col > row) is suited.
    expect(notationAt(0, 1)).toBe('AKs');
    expect(notationAt(3, 12)).toBe('J2s');
    // Below the diagonal (row > col) is offsuit.
    expect(notationAt(1, 0)).toBe('AKo');
    expect(notationAt(12, 3)).toBe('J2o');
  });

  it('always writes the higher rank first', () => {
    for (const hand of ALL_HANDS) {
      const first = RANKS.indexOf(hand[0] as (typeof RANKS)[number]);
      const second = RANKS.indexOf(hand[1] as (typeof RANKS)[number]);
      expect(first).toBeLessThanOrEqual(second);
    }
  });

  it('round-trips notation through grid coordinates', () => {
    for (const hand of ALL_HANDS) {
      const { row, col } = gridIndexOf(hand);
      expect(notationAt(row, col)).toBe(hand);
    }
  });

  it('rejects malformed notations', () => {
    for (const bad of ['AAs', 'AAo', 'KAo', 'XX', 'A', '', 'AKx', 'AK']) {
      expect(isHandNotation(bad)).toBe(false);
    }
    expect(() => gridIndexOf('KAo')).toThrow();
  });

  it('measures Chebyshev distance on the chart', () => {
    expect(gridDistance('AA', 'AA')).toBe(0);
    expect(gridDistance('AKs', 'AQs')).toBe(1);
    expect(gridDistance('AA', 'KK')).toBe(1);
  });
});

describe('dealing cards from a notation', () => {
  const alwaysFirst = () => 0;

  it('gives a pair two distinct suits of the same rank', () => {
    const [a, b] = cardsForNotation('AA', alwaysFirst);
    expect(a[0]).toBe('A');
    expect(b[0]).toBe('A');
    expect(a[1]).not.toBe(b[1]);
  });

  it('gives a suited hand one shared suit', () => {
    const [a, b] = cardsForNotation('AKs', alwaysFirst);
    expect(a[0]).toBe('A');
    expect(b[0]).toBe('K');
    expect(a[1]).toBe(b[1]);
  });

  it('gives an offsuit hand two different suits, higher rank first', () => {
    const [a, b] = cardsForNotation('AKo', alwaysFirst);
    expect(a[0]).toBe('A');
    expect(b[0]).toBe('K');
    expect(a[1]).not.toBe(b[1]);
  });

  it('never deals the same card twice, for any hand and any pick', () => {
    for (const hand of ALL_HANDS) {
      for (let seed = 0; seed < 4; seed += 1) {
        // `pick(bound)` is contracted to return an integer in [0, bound).
        const [a, b] = cardsForNotation(hand, (bound) => seed % bound);
        expect(a).not.toBe(b);
      }
    }
  });
});
