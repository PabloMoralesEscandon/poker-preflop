"""Pot Limit Omaha four-card starting-hand classes and combinatorics.

PLO has C(52,4) = 270,725 concrete hands, so ranges are defined over a
closed set of 47 *class keys* instead of the 169 Hold'em notations. Every
concrete hand maps to exactly one class.

The taxonomy and its numeric boundaries were fitted against the primary
source's own printed "% Dealt" figures (see docs/ranges/PLO-CALIBRATION.md)
and are frozen here:

- textures: suit multiplicity partition of the four cards
  r=[1,1,1,1] ss=[2,1,1] ds=[2,2] ts=[3,1] qs=[4];
  tri- and quad-suited hands are graded inside the ".ss" cell (the guide
  covers them as "play similarly to single suited hands, but slightly
  tighter") and weighted at TSQS_ALPHA x that frequency in statistics.
- pairs: tiers by top paired rank; two-pair hands belong to their higher
  pair's tier.
- non-pairs (all ranks distinct): rundowns by internal gaps for ace-less
  hands; ace hands cascade through the source's band rows.
- trips/quads are fold-only classes (cross-check source prints them folding
  at every position).
"""

from __future__ import annotations

from collections import Counter
from itertools import combinations
from random import Random
from typing import Any

PLO_RANKS = "AKQJT98765432"
PLO_SUITS = "shdc"
TOTAL_PLO_COMBOS = 270_725

# Fitted discount applied to tri-/quad-suited combos in range statistics.
TSQS_ALPHA = 0.65

PAIR_TIERS = ("AA", "KK", "QQ", "JJ", "TT", "99-66", "55-22")
NON_PAIR_SHAPES = ("0G", "1G", "2G", "A-KT", "A-96", "A-52", "OA", "Oth")
TEXTURES = ("ds", "ss", "r")
FOLD_ONLY_CLASSES = ("Trips", "Quads")

_ACE_BANDS = (
    ("A-KT", 1, 4),  # K, Q, J, T
    ("A-96", 5, 8),  # 9..6
    ("A-52", 9, 12),  # 5..2
)

# Uncollapsed per-class combo counts, frozen from exhaustive enumeration of
# all C(52,4) concrete hands under the locked taxonomy. "ts"/"qs" hands are
# graded in the ".ss" cell; the split is kept so stats can discount them.
CLASS_COMBOS: dict[str, dict[str, int]] = {
    "AA.ds": {"r": 0, "ss": 0, "ds": 864, "ts": 0, "qs": 0},
    "AA.ss": {"r": 0, "ss": 4248, "ds": 0, "ts": 792, "qs": 0},
    "AA.r": {"r": 864, "ss": 0, "ds": 0, "ts": 0, "qs": 0},
    "KK.ds": {"r": 0, "ss": 0, "ds": 858, "ts": 0, "qs": 0},
    "KK.ss": {"r": 0, "ss": 4224, "ds": 0, "ts": 792, "qs": 0},
    "KK.r": {"r": 858, "ss": 0, "ds": 0, "ts": 0, "qs": 0},
    "QQ.ds": {"r": 0, "ss": 0, "ds": 852, "ts": 0, "qs": 0},
    "QQ.ss": {"r": 0, "ss": 4200, "ds": 0, "ts": 792, "qs": 0},
    "QQ.r": {"r": 852, "ss": 0, "ds": 0, "ts": 0, "qs": 0},
    "JJ.ds": {"r": 0, "ss": 0, "ds": 846, "ts": 0, "qs": 0},
    "JJ.ss": {"r": 0, "ss": 4176, "ds": 0, "ts": 792, "qs": 0},
    "JJ.r": {"r": 846, "ss": 0, "ds": 0, "ts": 0, "qs": 0},
    "TT.ds": {"r": 0, "ss": 0, "ds": 840, "ts": 0, "qs": 0},
    "TT.ss": {"r": 0, "ss": 4152, "ds": 0, "ts": 792, "qs": 0},
    "TT.r": {"r": 840, "ss": 0, "ds": 0, "ts": 0, "qs": 0},
    "99-66.ds": {"r": 0, "ss": 0, "ds": 3300, "ts": 0, "qs": 0},
    "99-66.ss": {"r": 0, "ss": 16368, "ds": 0, "ts": 3168, "qs": 0},
    "99-66.r": {"r": 3300, "ss": 0, "ds": 0, "ts": 0, "qs": 0},
    "55-22.ds": {"r": 0, "ss": 0, "ds": 3204, "ts": 0, "qs": 0},
    "55-22.ss": {"r": 0, "ss": 15984, "ds": 0, "ts": 3168, "qs": 0},
    "55-22.r": {"r": 3204, "ss": 0, "ds": 0, "ts": 0, "qs": 0},
    "0G.ds": {"r": 0, "ss": 0, "ds": 324, "ts": 0, "qs": 0},
    "0G.ss": {"r": 0, "ss": 1296, "ds": 0, "ts": 432, "qs": 36},
    "0G.r": {"r": 216, "ss": 0, "ds": 0, "ts": 0, "qs": 0},
    "1G.ds": {"r": 0, "ss": 0, "ds": 864, "ts": 0, "qs": 0},
    "1G.ss": {"r": 0, "ss": 3456, "ds": 0, "ts": 1152, "qs": 96},
    "1G.r": {"r": 576, "ss": 0, "ds": 0, "ts": 0, "qs": 0},
    "2G.ds": {"r": 0, "ss": 0, "ds": 756, "ts": 0, "qs": 0},
    "2G.ss": {"r": 0, "ss": 3024, "ds": 0, "ts": 1008, "qs": 84},
    "2G.r": {"r": 504, "ss": 0, "ds": 0, "ts": 0, "qs": 0},
    "A-KT.ds": {"r": 0, "ss": 0, "ds": 1728, "ts": 0, "qs": 0},
    "A-KT.ss": {"r": 0, "ss": 6912, "ds": 0, "ts": 2304, "qs": 192},
    "A-KT.r": {"r": 1152, "ss": 0, "ds": 0, "ts": 0, "qs": 0},
    "A-96.ds": {"r": 0, "ss": 0, "ds": 1872, "ts": 0, "qs": 0},
    "A-96.ss": {"r": 0, "ss": 7488, "ds": 0, "ts": 2496, "qs": 208},
    "A-96.r": {"r": 1248, "ss": 0, "ds": 0, "ts": 0, "qs": 0},
    "A-52.ds": {"r": 0, "ss": 0, "ds": 1872, "ts": 0, "qs": 0},
    "A-52.ss": {"r": 0, "ss": 7488, "ds": 0, "ts": 2496, "qs": 208},
    "A-52.r": {"r": 1248, "ss": 0, "ds": 0, "ts": 0, "qs": 0},
    "OA.ds": {"r": 0, "ss": 0, "ds": 2448, "ts": 0, "qs": 0},
    "OA.ss": {"r": 0, "ss": 9792, "ds": 0, "ts": 3264, "qs": 272},
    "OA.r": {"r": 1632, "ss": 0, "ds": 0, "ts": 0, "qs": 0},
    "Oth.ds": {"r": 0, "ss": 0, "ds": 15876, "ts": 0, "qs": 0},
    "Oth.ss": {"r": 0, "ss": 63504, "ds": 0, "ts": 21168, "qs": 1764},
    "Oth.r": {"r": 10584, "ss": 0, "ds": 0, "ts": 0, "qs": 0},
    "Trips": {"r": 624, "ss": 1872, "ds": 0, "ts": 0, "qs": 0},
    "Quads": {"r": 13, "ss": 0, "ds": 0, "ts": 0, "qs": 0},
}

_CLASS_KEYS: tuple[str, ...] = tuple(
    [f"{tier}.{tex}" for tier in PAIR_TIERS for tex in TEXTURES]
    + [f"{shape}.{tex}" for shape in NON_PAIR_SHAPES for tex in TEXTURES]
    + list(FOLD_ONLY_CLASSES)
)

_PLO_CLASS_KEY_SET = frozenset(_CLASS_KEYS)


def plo_class_keys() -> tuple[str, ...]:
    """Return the 47 canonical PLO class keys in display order."""
    return _CLASS_KEYS


def plo_class_key_set() -> frozenset[str]:
    """Return the closed set of valid grid keys."""
    return _PLO_CLASS_KEY_SET


def _validate_cards(cards: Any) -> list[tuple[int, int]]:
    if not isinstance(cards, (list, tuple)) or len(cards) != 4:
        raise ValueError("Exactly four cards are required.")
    parsed: list[tuple[int, int]] = []
    for card in cards:
        if (
            not isinstance(card, str)
            or len(card) != 2
            or card[0] not in PLO_RANKS
            or card[1] not in PLO_SUITS
        ):
            raise ValueError(f"Invalid card notation: {card!r}.")
        parsed.append((PLO_RANKS.index(card[0]), PLO_SUITS.index(card[1])))
    if len(set(parsed)) != 4:
        raise ValueError("Cards must be distinct.")
    return parsed


def _raw_texture(suits: list[int]) -> str:
    partition = tuple(sorted(Counter(suits).values(), reverse=True))
    return {
        (1, 1, 1, 1): "r",
        (2, 1, 1): "ss",
        (2, 2): "ds",
        (3, 1): "ts",
        (4,): "qs",
    }[partition]


def _classify_indices(indices: tuple[int, ...] | list[int]) -> str:
    ranks = sorted(index // 4 for index in indices)
    tex_raw = _raw_texture([index % 4 for index in indices])
    tex = "ss" if tex_raw in ("ts", "qs") else tex_raw

    counts = Counter(ranks)
    multiplicities = sorted(counts.values(), reverse=True)
    if multiplicities[0] == 4:
        return "Quads"
    if multiplicities[0] == 3:
        return "Trips"
    if multiplicities[0] == 2:
        top_paired = min(rank for rank, count in counts.items() if count == 2)
        if top_paired <= 4:
            tier = PAIR_TIERS[top_paired]
        elif 5 <= top_paired <= 8:
            tier = "99-66"
        else:
            tier = "55-22"
        return f"{tier}.{tex}"

    others = [rank for rank in ranks if rank != 0]
    if ranks[0] == 0:
        first_label, first_lo, first_hi = _ACE_BANDS[0]
        if sum(1 for rank in others if first_lo <= rank <= first_hi) == 2:
            return f"{first_label}.{tex}"
        for label, lo, hi in _ACE_BANDS[1:]:
            if sum(1 for rank in others if lo <= rank <= hi) >= 2:
                return f"{label}.{tex}"
        return f"OA.{tex}"

    gaps = (ranks[-1] - ranks[0]) - 3
    if gaps <= 0:
        return f"0G.{tex}"
    if gaps == 1:
        return f"1G.{tex}"
    if gaps == 2:
        present = set(ranks)
        holes = [rank for rank in range(ranks[0], ranks[-1]) if rank not in present]
        if holes[1] - holes[0] == 1:
            return f"2G.{tex}"
    return f"Oth.{tex}"


def classify(cards: Any) -> str:
    """Map one concrete four-card hand to its canonical class key."""
    parsed = _validate_cards(cards)
    indices = [rank * 4 + suit for rank, suit in parsed]
    return _classify_indices(indices)


def plo_combos(key: str) -> int:
    """Concrete combinations represented by a class key (availability)."""
    try:
        counts = CLASS_COMBOS[key]
    except KeyError as exc:
        raise ValueError(f"Unknown PLO class key: {key!r}.") from exc
    return sum(counts.values())


def plo_effective_combos(key: str) -> float:
    """Combos weighted for statistics, with ts/qs discounted by TSQS_ALPHA."""
    try:
        counts = CLASS_COMBOS[key]
    except KeyError as exc:
        raise ValueError(f"Unknown PLO class key: {key!r}.") from exc
    plain = counts["r"] + counts["ss"] + counts["ds"]
    return plain + TSQS_ALPHA * (counts["ts"] + counts["qs"])


def deal_concrete(rng: Random) -> tuple[str, str, str, str]:
    """Deal one concrete four-card hand uniformly from the deck."""
    return _indices_to_cards(rng.sample(range(52), 4))


def _indices_to_cards(indices: tuple[int, ...] | list[int]) -> tuple[str, ...]:
    return tuple(PLO_RANKS[index // 4] + PLO_SUITS[index % 4] for index in indices)


_CLASS_HANDS_CACHE: dict[str, tuple[tuple[int, ...], ...]] | None = None


def _class_hands() -> dict[str, tuple[tuple[int, ...], ...]]:
    """Group every concrete hand by class key, built once per process."""
    global _CLASS_HANDS_CACHE
    if _CLASS_HANDS_CACHE is None:
        grouped: dict[str, list[tuple[int, ...]]] = {key: [] for key in _CLASS_KEYS}
        for indices in combinations(range(52), 4):
            grouped[_classify_indices(indices)].append(indices)
        _CLASS_HANDS_CACHE = {key: tuple(hands) for key, hands in grouped.items()}
    return _CLASS_HANDS_CACHE


def plo_cards_for_class(key: str, rng: Random) -> tuple[str, str, str, str]:
    """Deal one concrete hand uniformly among a class's combinations."""
    try:
        hands = _class_hands()[key]
    except KeyError as exc:
        raise ValueError(f"Unknown PLO class key: {key!r}.") from exc
    return _indices_to_cards(rng.choice(hands))  # type: ignore[return-value]


def plo_neighbors(key: str) -> list[str]:
    """Adjacent classes on the texture chain and within the shape ladder."""
    if key in FOLD_ONLY_CLASSES:
        return []

    shape, _, texture = key.partition(".")
    ladder = PAIR_TIERS if shape in PAIR_TIERS else NON_PAIR_SHAPES
    neighbours: list[str] = []
    chain_index = TEXTURES.index(texture)
    for step in (-1, 1):
        chain = chain_index + step
        if 0 <= chain < len(TEXTURES):
            neighbours.append(f"{shape}.{TEXTURES[chain]}")
    shape_index = ladder.index(shape)
    for step in (-1, 1):
        adjacent = shape_index + step
        if 0 <= adjacent < len(ladder):
            neighbours.append(f"{ladder[adjacent]}.{texture}")
    return neighbours


def plo_difficulty_factor(key: str, grid: dict[str, dict[str, float]]) -> int:
    """Borderline-sampling multiplier over the class adjacency graph."""
    frequency = sum(grid[key].values())
    if 0.0 < frequency < 1.0:
        return 6
    played = frequency > 0.0
    for neighbour in plo_neighbors(key):
        if (sum(grid[neighbour].values()) > 0.0) != played:
            return 4
    return 1


def plo_sampling_weight(key: str, grid: dict[str, dict[str, float]]) -> int:
    """Borderline-mode weight: availability times difficulty factor.

    Uniform mode uses ``plo_combos(key)`` directly.
    """
    return plo_combos(key) * plo_difficulty_factor(key, grid)
