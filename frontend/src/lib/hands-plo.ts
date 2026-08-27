/**
 * Mirror of `backend/src/learner/ranges/plo.py`.
 *
 * PLO has C(52,4) = 270,725 concrete hands, so ranges are keyed by one of
 * 47 class keys instead of Hold'em's 169 notations. The taxonomy and its
 * numeric boundaries are frozen on both sides and pinned by calibration
 * tests; see docs/ranges/PLO-CALIBRATION.md.
 */

export const PLO_RANKS = 'AKQJT98765432';
export const PLO_SUITS = 'shdc';
export const TOTAL_PLO_COMBOS = 270_725;

/** Tri-/quad-suited hands play like single-suited but tighter (stats only). */
export const TSQS_ALPHA = 0.65;

export const PLO_PAIR_TIERS = [
  'AA',
  'KK',
  'QQ',
  'JJ',
  'TT',
  '99-66',
  '55-22',
] as const;

export const PLO_NON_PAIR_SHAPES = [
  '0G',
  '1G',
  '2G',
  'A-KT',
  'A-96',
  'A-52',
  'OA',
  'Oth',
] as const;

export const PLO_TEXTURES = ['ds', 'ss', 'r'] as const;

export const PLO_FOLD_CLASSES = ['Trips', 'Quads'] as const;

const ACE_BANDS: ReadonlyArray<readonly [string, number, number]> = [
  ['A-KT', 1, 4],
  ['A-96', 5, 8],
  ['A-52', 9, 12],
];

/** Uncollapsed per-class combo counts, identical to the backend's constants. */
export const CLASS_COMBOS: Record<string, Record<string, number>> = {
  'AA.ds': { r: 0, ss: 0, ds: 864, ts: 0, qs: 0 },
  'AA.ss': { r: 0, ss: 4248, ds: 0, ts: 792, qs: 0 },
  'AA.r': { r: 864, ss: 0, ds: 0, ts: 0, qs: 0 },
  'KK.ds': { r: 0, ss: 0, ds: 858, ts: 0, qs: 0 },
  'KK.ss': { r: 0, ss: 4224, ds: 0, ts: 792, qs: 0 },
  'KK.r': { r: 858, ss: 0, ds: 0, ts: 0, qs: 0 },
  'QQ.ds': { r: 0, ss: 0, ds: 852, ts: 0, qs: 0 },
  'QQ.ss': { r: 0, ss: 4200, ds: 0, ts: 792, qs: 0 },
  'QQ.r': { r: 852, ss: 0, ds: 0, ts: 0, qs: 0 },
  'JJ.ds': { r: 0, ss: 0, ds: 846, ts: 0, qs: 0 },
  'JJ.ss': { r: 0, ss: 4176, ds: 0, ts: 792, qs: 0 },
  'JJ.r': { r: 846, ss: 0, ds: 0, ts: 0, qs: 0 },
  'TT.ds': { r: 0, ss: 0, ds: 840, ts: 0, qs: 0 },
  'TT.ss': { r: 0, ss: 4152, ds: 0, ts: 792, qs: 0 },
  'TT.r': { r: 840, ss: 0, ds: 0, ts: 0, qs: 0 },
  '99-66.ds': { r: 0, ss: 0, ds: 3300, ts: 0, qs: 0 },
  '99-66.ss': { r: 0, ss: 16368, ds: 0, ts: 3168, qs: 0 },
  '99-66.r': { r: 3300, ss: 0, ds: 0, ts: 0, qs: 0 },
  '55-22.ds': { r: 0, ss: 0, ds: 3204, ts: 0, qs: 0 },
  '55-22.ss': { r: 0, ss: 15984, ds: 0, ts: 3168, qs: 0 },
  '55-22.r': { r: 3204, ss: 0, ds: 0, ts: 0, qs: 0 },
  '0G.ds': { r: 0, ss: 0, ds: 324, ts: 0, qs: 0 },
  '0G.ss': { r: 0, ss: 1296, ds: 0, ts: 432, qs: 36 },
  '0G.r': { r: 216, ss: 0, ds: 0, ts: 0, qs: 0 },
  '1G.ds': { r: 0, ss: 0, ds: 864, ts: 0, qs: 0 },
  '1G.ss': { r: 0, ss: 3456, ds: 0, ts: 1152, qs: 96 },
  '1G.r': { r: 576, ss: 0, ds: 0, ts: 0, qs: 0 },
  '2G.ds': { r: 0, ss: 0, ds: 756, ts: 0, qs: 0 },
  '2G.ss': { r: 0, ss: 3024, ds: 0, ts: 1008, qs: 84 },
  '2G.r': { r: 504, ss: 0, ds: 0, ts: 0, qs: 0 },
  'A-KT.ds': { r: 0, ss: 0, ds: 1728, ts: 0, qs: 0 },
  'A-KT.ss': { r: 0, ss: 6912, ds: 0, ts: 2304, qs: 192 },
  'A-KT.r': { r: 1152, ss: 0, ds: 0, ts: 0, qs: 0 },
  'A-96.ds': { r: 0, ss: 0, ds: 1872, ts: 0, qs: 0 },
  'A-96.ss': { r: 0, ss: 7488, ds: 0, ts: 2496, qs: 208 },
  'A-96.r': { r: 1248, ss: 0, ds: 0, ts: 0, qs: 0 },
  'A-52.ds': { r: 0, ss: 0, ds: 1872, ts: 0, qs: 0 },
  'A-52.ss': { r: 0, ss: 7488, ds: 0, ts: 2496, qs: 208 },
  'A-52.r': { r: 1248, ss: 0, ds: 0, ts: 0, qs: 0 },
  'OA.ds': { r: 0, ss: 0, ds: 2448, ts: 0, qs: 0 },
  'OA.ss': { r: 0, ss: 9792, ds: 0, ts: 3264, qs: 272 },
  'OA.r': { r: 1632, ss: 0, ds: 0, ts: 0, qs: 0 },
  'Oth.ds': { r: 0, ss: 0, ds: 15876, ts: 0, qs: 0 },
  'Oth.ss': { r: 0, ss: 63504, ds: 0, ts: 21168, qs: 1764 },
  'Oth.r': { r: 10584, ss: 0, ds: 0, ts: 0, qs: 0 },
  Trips: { r: 624, ss: 1872, ds: 0, ts: 0, qs: 0 },
  Quads: { r: 13, ss: 0, ds: 0, ts: 0, qs: 0 },
};

/** The closed set of grid keys, in display order. */
export const PLO_CLASS_KEYS: readonly string[] = [
  ...PLO_PAIR_TIERS.flatMap((tier) => PLO_TEXTURES.map((tex) => `${tier}.${tex}`)),
  ...PLO_NON_PAIR_SHAPES.flatMap((shape) =>
    PLO_TEXTURES.map((tex) => `${shape}.${tex}`),
  ),
  ...PLO_FOLD_CLASSES,
];

function rawTexture(suits: number[]): string {
  const counts = new Map<number, number>();
  for (const suit of suits) counts.set(suit, (counts.get(suit) ?? 0) + 1);
  const partition = [...counts.values()].sort((a, b) => b - a).join(',');
  switch (partition) {
    case '1,1,1,1':
      return 'r';
    case '2,1,1':
      return 'ss';
    case '2,2':
      return 'ds';
    case '3,1':
      return 'ts';
    case '4':
      return 'qs';
    default:
      throw new RangeError(`Impossible suit partition: ${partition}`);
  }
}

/**
 * Map four concrete cards to their class key.
 *
 * Throws RangeError unless given exactly four distinct valid card strings.
 */
export function classifyPloHand(cards: readonly string[]): string {
  if (cards.length !== 4) {
    throw new RangeError('Exactly four cards are required.');
  }
  const parsed: Array<[number, number]> = cards.map((card) => {
    const rank = card.slice(0, 1);
    const suit = card.slice(1, 2);
    if (
      card.length !== 2 ||
      !PLO_RANKS.includes(rank) ||
      !PLO_SUITS.includes(suit)
    ) {
      throw new RangeError(`Invalid card notation: ${card}`);
    }
    return [PLO_RANKS.indexOf(rank), PLO_SUITS.indexOf(suit)];
  });
  if (new Set(cards).size !== 4) {
    throw new RangeError('Cards must be distinct.');
  }

  const ranks = parsed.map((entry) => entry[0]).sort((a, b) => a - b);
  const texRaw = rawTexture(parsed.map((entry) => entry[1]));
  const tex = texRaw === 'ts' || texRaw === 'qs' ? 'ss' : texRaw;

  const countByRank = new Map<number, number>();
  for (const rank of ranks) {
    countByRank.set(rank, (countByRank.get(rank) ?? 0) + 1);
  }
  const multiplicities = [...countByRank.values()].sort((a, b) => b - a);
  if (multiplicities[0] === 4) return 'Quads';
  if (multiplicities[0] === 3) return 'Trips';
  if (multiplicities[0] === 2) {
    let topPaired = 12;
    for (const [rank, count] of countByRank) {
      if (count === 2 && rank < topPaired) topPaired = rank;
    }
    const tier =
      topPaired <= 4
        ? PLO_PAIR_TIERS[topPaired]
        : topPaired <= 8
          ? '99-66'
          : '55-22';
    return `${tier}.${tex}`;
  }

  const others = ranks.filter((rank) => rank !== 0);
  const firstBand = ACE_BANDS[0];
  if ((ranks[0] ?? 12) === 0 && firstBand) {
    const [firstLabel, firstLo, firstHi] = firstBand;
    if (others.filter((r) => r >= firstLo && r <= firstHi).length === 2) {
      return `${firstLabel}.${tex}`;
    }
    for (const [label, lo, hi] of ACE_BANDS.slice(1)) {
      if (others.filter((r) => r >= lo && r <= hi).length >= 2) {
        return `${label}.${tex}`;
      }
    }
    return `OA.${tex}`;
  }

  const lowest = ranks[0] ?? 12;
  const highest = ranks[ranks.length - 1] ?? 0;
  const gaps = highest - lowest - 3;
  if (gaps <= 0) return `0G.${tex}`;
  if (gaps === 1) return `1G.${tex}`;
  if (gaps === 2) {
    const present = new Set(ranks);
    const holes: number[] = [];
    for (let rank = lowest; rank < highest; rank += 1) {
      if (!present.has(rank)) holes.push(rank);
    }
    const firstHole = holes[0];
    const secondHole = holes[1];
    if (firstHole !== undefined && secondHole === firstHole + 1) {
      return `2G.${tex}`;
    }
  }
  return `Oth.${tex}`;
}

/** Concrete combinations a class key stands in for. */
export function ploCombos(key: string): number {
  const counts = CLASS_COMBOS[key];
  if (!counts) throw new RangeError(`Unknown PLO class key: ${key}`);
  return (
    (counts.r ?? 0) +
    (counts.ss ?? 0) +
    (counts.ds ?? 0) +
    (counts.ts ?? 0) +
    (counts.qs ?? 0)
  );
}

/** Combos weighted for statistics, with ts/qs discounted by TSQS_ALPHA. */
export function ploEffectiveCombos(key: string): number {
  const counts = CLASS_COMBOS[key];
  if (!counts) throw new RangeError(`Unknown PLO class key: ${key}`);
  return (
    (counts.r ?? 0) +
    (counts.ss ?? 0) +
    (counts.ds ?? 0) +
    TSQS_ALPHA * ((counts.ts ?? 0) + (counts.qs ?? 0))
  );
}

/** Adjacent classes on the texture chain and within the shape ladder. */
export function ploNeighbors(key: string): string[] {
  if (key === 'Trips' || key === 'Quads') return [];
  const dot = key.indexOf('.');
  const shape = key.slice(0, dot);
  const texture = key.slice(dot + 1);
  const ladder: readonly string[] = PLO_PAIR_TIERS.includes(
    shape as never,
  )
    ? PLO_PAIR_TIERS
    : PLO_NON_PAIR_SHAPES;
  const chainIndex = PLO_TEXTURES.indexOf(texture as never);
  const shapeIndex = ladder.indexOf(shape as never);
  const neighbours: string[] = [];
  for (const step of [-1, 1]) {
    const chain = chainIndex + step;
    if (chain >= 0 && chain < PLO_TEXTURES.length) {
      neighbours.push(`${shape}.${PLO_TEXTURES[chain]}`);
    }
  }
  for (const step of [-1, 1]) {
    const adjacent = shapeIndex + step;
    if (adjacent >= 0 && adjacent < ladder.length) {
      neighbours.push(`${ladder[adjacent]}.${texture}`);
    }
  }
  return neighbours;
}

function playedFrequency(cell: Record<string, number>): number {
  return Object.values(cell).reduce((sum, value) => sum + value, 0);
}

/** Borderline-sampling multiplier over the class adjacency graph. */
export function ploDifficultyFactor(
  key: string,
  grid: Record<string, Record<string, number>>,
): number {
  const frequency = playedFrequency(grid[key] ?? {});
  if (frequency > 0 && frequency < 1) return 6;
  const played = frequency > 0;
  for (const neighbour of ploNeighbors(key)) {
    if ((playedFrequency(grid[neighbour] ?? {}) > 0) !== played) return 4;
  }
  return 1;
}
