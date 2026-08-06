/**
 * Poker hand-notation helpers. Pure, drill-agnostic, and free of any API or
 * fixture knowledge — both the range grid component and the mock API build on
 * this.
 *
 * Notation and combinatorics follow docs/API-CONTRACT.md §1 and
 * docs/RANGE-DATA-FORMAT.md §4–§5.
 */

export const RANKS = [
  'A',
  'K',
  'Q',
  'J',
  'T',
  '9',
  '8',
  '7',
  '6',
  '5',
  '4',
  '3',
  '2',
] as const;

export type Rank = (typeof RANKS)[number];

export const SUITS = ['s', 'h', 'd', 'c'] as const;

export type Suit = (typeof SUITS)[number];

export type HandType = 'pair' | 'suited' | 'offsuit';

/** Row/column position on the standard 13×13 chart. */
export interface GridIndex {
  row: number;
  col: number;
}

const RANK_INDEX: ReadonlyMap<string, number> = new Map(
  RANKS.map((rank, index) => [rank, index])
);

function rankAt(index: number): Rank {
  const rank = RANKS[index];
  if (rank === undefined) {
    throw new RangeError(`Rank index ${index} is outside 0..12`);
  }
  return rank;
}

/**
 * The notation in cell (row, col) of the standard chart.
 *
 * Rows and columns both run A→2. Pairs sit on the diagonal, suited hands above
 * it, offsuit hands below it. Getting this backwards is the classic range-grid
 * bug, so it lives in exactly one place.
 */
export function notationAt(row: number, col: number): string {
  const high = rankAt(row);
  const low = rankAt(col);
  if (row === col) return `${high}${high}`;
  if (row < col) return `${high}${low}s`;
  return `${low}${high}o`;
}

/** Where a notation sits on the chart. Inverse of {@link notationAt}. */
export function gridIndexOf(notation: string): GridIndex {
  const first = RANK_INDEX.get(notation[0] ?? '');
  const second = RANK_INDEX.get(notation[1] ?? '');
  if (first === undefined || second === undefined) {
    throw new RangeError(`Not a hand notation: ${notation}`);
  }

  const suffix = notation.slice(2);
  if (first === second) {
    if (suffix !== '') throw new RangeError(`Not a hand notation: ${notation}`);
    return { row: first, col: first };
  }
  // The higher rank is always written first, so `first` is the smaller index.
  if (first > second) throw new RangeError(`Not a hand notation: ${notation}`);
  if (suffix === 's') return { row: first, col: second };
  if (suffix === 'o') return { row: second, col: first };
  throw new RangeError(`Not a hand notation: ${notation}`);
}

/** All 169 notations, in chart order (row-major). */
export const ALL_HANDS: readonly string[] = RANKS.flatMap((_, row) =>
  RANKS.map((__, col) => notationAt(row, col))
);

export function isHandNotation(value: string): boolean {
  try {
    gridIndexOf(value);
    return true;
  } catch {
    return false;
  }
}

export function handTypeOf(notation: string): HandType {
  const { row, col } = gridIndexOf(notation);
  if (row === col) return 'pair';
  return row < col ? 'suited' : 'offsuit';
}

/** Combos per hand type. Fixed values, never derived at runtime per request. */
export function combosOf(notation: string): number {
  switch (handTypeOf(notation)) {
    case 'pair':
      return 6;
    case 'suited':
      return 4;
    case 'offsuit':
      return 12;
  }
}

/** Chebyshev distance on the chart, used for "near a boundary" tests. */
export function gridDistance(a: string, b: string): number {
  const left = gridIndexOf(a);
  const right = gridIndexOf(b);
  return Math.max(
    Math.abs(left.row - right.row),
    Math.abs(left.col - right.col)
  );
}

/**
 * Deals a concrete two-card hand for a notation, per RANGE-DATA-FORMAT §5.
 * `pick(n)` must return an integer in `[0, n)`.
 */
export function cardsForNotation(
  notation: string,
  pick: (bound: number) => number
): [string, string] {
  const { row, col } = gridIndexOf(notation);
  const high = rankAt(Math.min(row, col));
  const low = rankAt(Math.max(row, col));

  if (row === col) {
    const [first, second] = twoDistinctSuits(pick);
    return [`${high}${first}`, `${high}${second}`];
  }
  if (row < col) {
    const suit = SUITS[pick(SUITS.length)] ?? 's';
    return [`${high}${suit}`, `${low}${suit}`];
  }
  const [first, second] = twoDistinctSuits(pick);
  return [`${high}${first}`, `${low}${second}`];
}

function twoDistinctSuits(pick: (bound: number) => number): [Suit, Suit] {
  const first = pick(SUITS.length);
  const offset = 1 + pick(SUITS.length - 1);
  const second = (first + offset) % SUITS.length;
  return [SUITS[first] ?? 's', SUITS[second] ?? 'h'];
}
