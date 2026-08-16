import { describe, expect, it } from 'vitest';

import { bbAmount, formatBb, formatChips } from '@/lib/bb';

/**
 * The distinction these functions exist for: an amount that cannot be zero and
 * one that can. `check` has size `0.0` (RANGE-DATA-FORMAT §9), and rendering
 * that as "0bb" is the specific bug FE-13 asks to be kept out of the UI.
 */

describe('bbAmount', () => {
  it('drops a trailing zero rather than claiming precision', () => {
    expect(bbAmount(4)).toBe('4');
    expect(bbAmount(4.0)).toBe('4');
    expect(bbAmount(100)).toBe('100');
  });

  it('keeps one decimal where the size has one', () => {
    expect(bbAmount(2.5)).toBe('2.5');
    expect(bbAmount(3.5)).toBe('3.5');
    expect(bbAmount(10.5)).toBe('10.5');
  });

  it('keeps the second decimal a 3-bet size actually has', () => {
    // 3.5x of a 2.5bb open. Rounding this to 8.8 would misreport a size the
    // calibration document states exactly (VS-RFI-CALIBRATION §1.1).
    expect(bbAmount(8.75)).toBe('8.75');
  });
});

describe('formatBb', () => {
  it('appends the unit', () => {
    expect(formatBb(2.5)).toBe('2.5bb');
    expect(formatBb(4)).toBe('4bb');
    expect(formatBb(8.75)).toBe('8.75bb');
  });
});

describe('formatChips', () => {
  it('spells out an action that costs nothing', () => {
    expect(formatChips(0)).toBe('no chips');
    expect(formatChips(0.0)).toBe('no chips');
  });

  it('is otherwise formatBb', () => {
    expect(formatChips(3.5)).toBe('3.5bb');
    expect(formatChips(1)).toBe('1bb');
  });

  it('never produces the string "0bb"', () => {
    for (const value of [0, 0.0, 1, 2.5, 3.5, 100]) {
      expect(formatChips(value)).not.toMatch(/(^|[^\d.])0(\.0+)?bb/);
    }
  });
});
