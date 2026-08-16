import hashlib
import json
import warnings
from collections import defaultdict
from itertools import pairwise
from pathlib import Path

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
    "BB_vs_SB": {"3bet": 218.0, "call": 640.0},
}
RAISER_ORDER = ("UTG", "HJ", "CO", "BTN", "SB")
PREMIUMS = ("AA", "KK", "QQ", "AKs")
BOTTOM = ("72o", "82o", "92o", "32o", "42o")
IN_POSITION_MATCHUPS = {
    "HJ_vs_UTG",
    "CO_vs_UTG",
    "CO_vs_HJ",
    "BTN_vs_UTG",
    "BTN_vs_HJ",
    "BTN_vs_CO",
    "BB_vs_SB",
}
VS_RFI_GRID_DIGESTS = {
    "BB_vs_BTN.json": (
        "0318cd5a087a72247139ec562045663f0d3e934b29826459f4891c0b2da023e8"
    ),
    "BB_vs_CO.json": "d54eeb5a3ba4aa481e4cf50e689f214f66a28682165dca8fe9a79e4a4448131c",
    "BB_vs_HJ.json": "cfebe899746074deac5ac8cd62ad719d8c89e76391651921349ccdce09b7d28e",
    "BB_vs_UTG.json": (
        "02346f46f735acfecf9b7959453b4ab0bba62c8d361bb86875b97deaf2d8de1d"
    ),
    "BTN_vs_CO.json": (
        "8cbd9d26d0adbc75f28e4800c3c04d1265e27dd8ec39a5e79cd1c53d090ae6d8"
    ),
    "BTN_vs_HJ.json": (
        "1b18911cdcc19a6a546fd314722cd2e0987dcfccbd7eda91547774e13ef3c635"
    ),
    "BTN_vs_UTG.json": (
        "0613bce6f7d0302851289b8781a9e45d71fd08390fb8972fa124263bb1c0238d"
    ),
    "CO_vs_HJ.json": "5dc34432a219efc6bb768e96a0f49a00f0f6f3805f556cc30f7e82849c325bf0",
    "CO_vs_UTG.json": (
        "ff96250af8fec4f693cdffe2be132c209fdc7e911e5388f893a6f170a2f5a927"
    ),
    "HJ_vs_UTG.json": (
        "05da06395b9581153586b57b94b9e8e0bb96cf1fe85a13bbdda2b162817515b0"
    ),
    "SB_vs_BTN.json": (
        "050496a9879103157ff519bfeca70a0b68d192bb4ab075617299a877ac56f698"
    ),
    "SB_vs_CO.json": "2306ffd17a6e183abda88cbf83bd159bde75e087076f2d1b327ca53d29340ab7",
    "SB_vs_HJ.json": "99122baa27b89cdf45ad45cdc88e58de81ee6a783a28cad99b9c2b3317c7c0a8",
    "SB_vs_UTG.json": (
        "cda422707797ca54d3029cae7b90f79620deb6881c3058187be2d562ba7c850a"
    ),
}


@pytest.fixture(scope="module")
def matchup_ranges() -> list[RangeData]:
    return load_ranges().list(spot="vs_rfi", table_format="6max")


def matchup_id(range_data: RangeData) -> str:
    return f"{range_data.position}_vs_{range_data.vs_position}"


def test_corrected_sizing_did_not_change_any_matchup_grid() -> None:
    data_root = (
        Path(__file__).resolve().parents[1] / "data" / "ranges" / "vs_rfi" / "6max"
    )
    actual: dict[str, str] = {}
    for filename in VS_RFI_GRID_DIGESTS:
        payload = json.loads((data_root / filename).read_text(encoding="utf-8"))
        encoded = json.dumps(
            payload["grid"], sort_keys=True, separators=(",", ":")
        ).encode()
        actual[filename] = hashlib.sha256(encoded).hexdigest()

    assert actual == VS_RFI_GRID_DIGESTS


def test_3bet_sizes_are_derived_from_facing_size(
    matchup_ranges: list[RangeData],
) -> None:
    for range_data in matchup_ranges:
        matchup = matchup_id(range_data)
        multiplier = 3.5 if matchup in IN_POSITION_MATCHUPS else 4.0
        assert range_data.facing_size_bb is not None
        assert range_data.action_sizes_bb["3bet"] == (
            multiplier * range_data.facing_size_bb
        )
        if "call" in range_data.actions:
            assert range_data.action_sizes_bb["call"] == range_data.facing_size_bb


def test_all_fifteen_matchups_equal_the_chart_printed_totals(
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
                    f"{range_data.range_id} plays {high}{low}o more than {high}{low}s"
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
