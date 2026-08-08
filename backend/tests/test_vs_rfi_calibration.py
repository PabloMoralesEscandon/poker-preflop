import warnings
from collections import defaultdict
from itertools import pairwise

import pytest

from learner.ranges.loader import load_ranges
from learner.ranges.models import RANKS, RangeData, played_frequency

EXPECTED_BY_ACTION = {
    "HJ_vs_UTG": {"3bet": 108.0},
    "CO_vs_UTG": {"3bet": 114.0},
    "CO_vs_HJ": {"3bet": 134.0},
    "BTN_vs_UTG": {"3bet": 96.0, "call": 92.0},
    "BTN_vs_HJ": {"3bet": 118.0, "call": 84.0},
    "BTN_vs_CO": {"3bet": 160.0, "call": 72.0},
    "SB_vs_UTG": {"3bet": 96.0},
    "SB_vs_HJ": {"3bet": 116.0},
    "SB_vs_CO": {"3bet": 146.0},
    "SB_vs_BTN": {"3bet": 200.0},
    "BB_vs_UTG": {"3bet": 76.0, "call": 306.0},
    "BB_vs_HJ": {"3bet": 98.0, "call": 320.0},
    "BB_vs_CO": {"3bet": 128.0, "call": 342.0},
    "BB_vs_BTN": {"3bet": 178.0, "call": 576.0},
}
RAISER_ORDER = ("UTG", "HJ", "CO", "BTN")
PREMIUMS = ("AA", "KK", "QQ", "AKs")
BOTTOM = ("72o", "82o", "92o", "32o", "42o")


@pytest.fixture(scope="module")
def matchup_ranges() -> list[RangeData]:
    return load_ranges().list(spot="vs_rfi", table_format="6max")


def matchup_id(range_data: RangeData) -> str:
    return f"{range_data.position}_vs_{range_data.vs_position}"


def test_all_fourteen_matchups_equal_the_chart_printed_totals(
    matchup_ranges: list[RangeData],
) -> None:
    assert {matchup_id(item) for item in matchup_ranges} == set(EXPECTED_BY_ACTION)
    for range_data in matchup_ranges:
        assert range_data.stats.by_action == EXPECTED_BY_ACTION[matchup_id(range_data)]


def test_pairs_are_contiguous_from_aces(matchup_ranges: list[RangeData]) -> None:
    for range_data in matchup_ranges:
        folded_higher_pair = False
        for rank in RANKS:
            hand = rank * 2
            played = played_frequency(range_data.grid[hand]) > 0.0
            assert not (played and folded_higher_pair), (
                f"{range_data.range_id} plays {hand} after folding a higher pair"
            )
            folded_higher_pair = folded_higher_pair or not played


def test_premiums_are_never_folded(matchup_ranges: list[RangeData]) -> None:
    for range_data in matchup_ranges:
        for hand in PREMIUMS:
            assert played_frequency(range_data.grid[hand]) == 1.0, (
                f"{range_data.range_id} folds some of {hand}"
            )


def test_bottom_is_always_pure_fold(matchup_ranges: list[RangeData]) -> None:
    for range_data in matchup_ranges:
        for hand in BOTTOM:
            assert played_frequency(range_data.grid[hand]) == 0.0, (
                f"{range_data.range_id} plays some of {hand}"
            )


def test_suited_dominates_offsuit(matchup_ranges: list[RangeData]) -> None:
    for range_data in matchup_ranges:
        for high_index, high in enumerate(RANKS):
            for low in RANKS[high_index + 1 :]:
                suited = played_frequency(range_data.grid[f"{high}{low}s"])
                offsuit = played_frequency(range_data.grid[f"{high}{low}o"])
                assert suited >= offsuit, (
                    f"{range_data.range_id} plays {high}{low}o more than "
                    f"{high}{low}s"
                )


def test_defending_widening_is_reported_not_enforced(
    matchup_ranges: list[RangeData],
) -> None:
    by_hero: dict[str, list[tuple[int, str, float]]] = defaultdict(list)
    for range_data in matchup_ranges:
        raiser = range_data.vs_position
        assert raiser is not None
        by_hero[range_data.position].append(
            (RAISER_ORDER.index(raiser), raiser, range_data.stats.combos)
        )

    violations: list[str] = []
    for hero, entries in by_hero.items():
        ordered = sorted(entries)
        report = ", ".join(f"{raiser}={combos:g}" for _, raiser, combos in ordered)
        print(f"vs_rfi widening report: {hero}: {report}")
        for left, right in pairwise(ordered):
            if left[2] > right[2]:
                violations.append(
                    f"{hero}: {left[1]}={left[2]:g} > {right[1]}={right[2]:g}"
                )

    if violations:
        warnings.warn(
            "Defending-frequency widening needs review: " + "; ".join(violations),
            stacklevel=1,
        )


def test_matchup_actions_and_sizes_obey_the_closed_contract(
    matchup_ranges: list[RangeData],
) -> None:
    for range_data in matchup_ranges:
        assert set(range_data.actions) <= {"call", "3bet"}
        assert set(range_data.action_sizes_bb) == set(range_data.actions)


def test_shipped_matchup_ranges_are_pure_strategies(
    matchup_ranges: list[RangeData],
) -> None:
    for range_data in matchup_ranges:
        for cell in range_data.grid.values():
            assert not cell or list(cell.values()) == [1.0]
