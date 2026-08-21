import { describe, expect, it } from 'vitest';

import {
  CLASS_COMBOS,
  PLO_CLASS_KEYS,
  TOTAL_PLO_COMBOS,
  classifyPloHand,
  ploCombos,
  ploDifficultyFactor,
  ploEffectiveCombos,
  ploNeighbors,
} from '@/lib/hands-plo';

describe('PLO class universe', () => {
  it('has exactly 47 distinct keys', () => {
    expect(PLO_CLASS_KEYS).toHaveLength(47);
    expect(new Set(PLO_CLASS_KEYS).size).toBe(47);
  });

  it('combo counts sum to the full deck', () => {
    const total = PLO_CLASS_KEYS.reduce((sum, key) => sum + ploCombos(key), 0);
    expect(total).toBe(TOTAL_PLO_COMBOS);
    expect(TOTAL_PLO_COMBOS).toBe(270_725);
  });

  it('effective combos never exceed availability', () => {
    for (const key of PLO_CLASS_KEYS) {
      expect(ploEffectiveCombos(key)).toBeLessThanOrEqual(ploCombos(key));
    }
  });

  it('freezes the analytic identities', () => {
    expect(CLASS_COMBOS['0G.r']?.r).toBe(9 * 24);
    expect(CLASS_COMBOS['0G.ds']?.ds).toBe(9 * 36);
    expect(CLASS_COMBOS.Quads).toEqual({
      r: 13,
      ss: 0,
      ds: 0,
      ts: 0,
      qs: 0,
    });
  });
});

describe('classifyPloHand', () => {
  it.each([
    [['As', 'Ah', 'Ks', 'Qh'], 'AA.ds'],
    [['As', 'Ah', 'Kd', 'Qc'], 'AA.r'],
    [['As', 'Ah', 'Ks', 'Qs'], 'AA.ss'],
    [['Kh', 'Kd', 'Qh', 'Qd'], 'KK.ds'],
    [['7h', '7d', '7c', '2s'], 'Trips'],
    [['As', 'Ks', 'Qs', 'Js'], 'OA.ss'],
    [['As', 'Ah', 'Ad', 'Ac'], 'Quads'],
    [['Ks', 'Qh', 'Jd', 'Tc'], '0G.r'],
    [['As', 'Ts', '9h', '8d'], 'A-96.ss'],
    [['As', '5h', '3d', '2c'], 'A-52.r'],
    [['7s', '6h', '5d', '4c'], '0G.r'],
    [['9s', '8h', '7d', '5c'], '1G.r'],
    [['9s', '8h', '5d', '4c'], '2G.r'],
    [['9s', '7h', '5d', '4c'], 'Oth.r'],
    [['Ks', 'Qs', 'Jh', '8d'], '2G.ss'],
  ])('classifies %j as %s', (cards, expected) => {
    expect(classifyPloHand(cards)).toBe(expected);
  });

  it.each([
    [[]],
    [['As', 'As', 'Kh', 'Qd']],
    [['As', 'Kh', 'Qd']],
    [['Ax', 'Kh', 'Qd', 'Jc']],
  ])('rejects %j', (cards) => {
    expect(() => classifyPloHand(cards)).toThrow(RangeError);
  });
});

describe('dealing-adjacent helpers', () => {
  it('keeps neighbours inside the universe and chains textures', () => {
    for (const key of PLO_CLASS_KEYS) {
      for (const neighbour of ploNeighbors(key)) {
        expect(PLO_CLASS_KEYS).toContain(neighbour);
      }
    }
    expect(ploNeighbors('AA.ds')).toEqual(['AA.ss', 'KK.ds']);
    expect(ploNeighbors('55-22.r')).toEqual(['55-22.ss', '99-66.r']);
    expect(ploNeighbors('1G.ss')).toEqual([
      '1G.ds',
      '1G.r',
      '0G.ss',
      '2G.ss',
    ]);
    expect(ploNeighbors('Trips')).toEqual([]);
    expect(ploNeighbors('Quads')).toEqual([]);
  });

  it('scores mixed cells 6, boundary cells 4, plain cells 1', () => {
    const grid: Record<string, Record<string, number>> = {};
    for (const key of PLO_CLASS_KEYS) grid[key] = {};
    grid['AA.ss'] = { raise: 0.5 };
    grid['KK.ds'] = { raise: 1 };
    expect(ploDifficultyFactor('AA.ss', grid)).toBe(6);
    expect(ploDifficultyFactor('KK.ds', grid)).toBe(4);
    expect(ploDifficultyFactor('KK.r', grid)).toBe(1);
    expect(ploDifficultyFactor('TT.ss', grid)).toBe(1);
    expect(ploDifficultyFactor('Trips', grid)).toBe(1);
  });
});
