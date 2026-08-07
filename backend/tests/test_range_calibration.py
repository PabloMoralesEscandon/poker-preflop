from itertools import pairwise

import pytest

from learner.ranges.loader import RangeIndex, load_ranges
from learner.ranges.models import (
    RANKS,
    TOTAL_COMBOS,
    RangeData,
    canonical_hands,
    combos,
    played_frequency,
    sampling_weight,
)

SIX_MAX_TARGETS = {
    "UTG": {"raise": (226, 0.165, 0.175)},
    "HJ": {"raise": (284, 0.209, 0.219)},
    "CO": {"raise": (368, 0.273, 0.283)},
    "BTN": {"raise": (574, 0.428, 0.438)},
    "SB": {
        "raise": (322, 0.238, 0.248),
        "limp": (504, 0.375, 0.385),
    },
}

EIGHT_MAX_TARGETS = {
    "UTG": (160, 12.1),
    "UTG1": (176, 13.3),
    "LJ": (214, 16.1),
    "HJ": (260, 19.6),
    "CO": (350, 26.4),
    "BTN": (542, 40.9),
    "SB": (982, 74.1),
}

POSITION_ORDER = {
    "6max": ("UTG", "HJ", "CO", "BTN"),
    "8max": ("UTG", "UTG1", "LJ", "HJ", "CO", "BTN"),
}

PREMIUMS = {"AA", "KK", "QQ", "JJ", "AKs", "AKo", "AQs"}
BOTTOM = {"72o", "82o", "83o", "92o", "93o", "32o", "42o", "52o"}


@pytest.fixture(scope="module")
def ranges() -> RangeIndex:
    return load_ranges()


def action_combos(range_data: RangeData, action: str) -> float:
    return sum(
        cell.get(action, 0.0) * combos(hand) for hand, cell in range_data.grid.items()
    )


def test_6max_exact_action_combos_and_vpip_bands(ranges: RangeIndex) -> None:
    for position, actions in SIX_MAX_TARGETS.items():
        range_data = ranges.get(f"rfi_6max_{position}")
        for action, (expected_combos, minimum, maximum) in actions.items():
            actual_combos = action_combos(range_data, action)
            assert actual_combos == expected_combos
            assert minimum <= actual_combos / TOTAL_COMBOS <= maximum


def test_8max_exact_combos_and_displayed_vpip(ranges: RangeIndex) -> None:
    for position, (expected_combos, expected_vpip) in EIGHT_MAX_TARGETS.items():
        range_data = ranges.get(f"rfi_8max_{position}")
        actual_combos = action_combos(range_data, "raise")
        assert actual_combos == expected_combos
        assert round(actual_combos / TOTAL_COMBOS * 100, 1) == expected_vpip


def test_invariant_1_raise_vpip_widens_strictly_through_button(
    ranges: RangeIndex,
) -> None:
    for table_format, positions in POSITION_ORDER.items():
        values = [
            action_combos(ranges.get(f"rfi_{table_format}_{position}"), "raise")
            for position in positions
        ]
        assert all(left < right for left, right in pairwise(values))


def test_invariant_2_premiums_are_never_folded(ranges: RangeIndex) -> None:
    for range_data in ranges.list(spot="rfi"):
        for hand in PREMIUMS:
            assert played_frequency(range_data.grid[hand]) == 1.0, (
                f"{range_data.range_id} folds some of {hand}"
            )


def test_invariant_3_bottom_is_always_pure_fold(ranges: RangeIndex) -> None:
    for range_data in ranges.list(spot="rfi"):
        for hand in BOTTOM:
            assert played_frequency(range_data.grid[hand]) == 0.0, (
                f"{range_data.range_id} plays some of {hand}"
            )


def test_invariant_4_suited_dominates_offsuit(ranges: RangeIndex) -> None:
    for range_data in ranges.list(spot="rfi"):
        for high_index, high in enumerate(RANKS):
            for low in RANKS[high_index + 1 :]:
                suited = played_frequency(range_data.grid[f"{high}{low}s"])
                offsuit = played_frequency(range_data.grid[f"{high}{low}o"])
                assert suited >= offsuit, (
                    f"{range_data.range_id} plays {high}{low}o more than {high}{low}s"
                )


def test_invariant_5_kickers_descend_with_only_one_wheel_exception(
    ranges: RangeIndex,
) -> None:
    for range_data in ranges.list(spot="rfi"):
        wheel_exceptions = 0
        for high_index, high in enumerate(RANKS):
            for suitedness in "so":
                previous = 1.0
                for kicker in RANKS[high_index + 1 :]:
                    hand = f"{high}{kicker}{suitedness}"
                    current = played_frequency(range_data.grid[hand])
                    if current > previous:
                        assert high == "A" and suitedness == "s" and kicker in "5432", (
                            f"{range_data.range_id} has a non-wheel kicker inversion "
                            f"at {hand}"
                        )
                        wheel_exceptions += 1
                    previous = current
        assert wheel_exceptions <= 1, (
            f"{range_data.range_id} has {wheel_exceptions} wheel-ace inversions"
        )


def test_invariant_6_pairs_are_contiguous_from_aces(ranges: RangeIndex) -> None:
    for range_data in ranges.list(spot="rfi"):
        folded_higher_pair = False
        for rank in RANKS:
            hand = rank * 2
            played = played_frequency(range_data.grid[hand]) > 0.0
            assert not (played and folded_higher_pair), (
                f"{range_data.range_id} plays {hand} after folding a higher pair"
            )
            folded_higher_pair = folded_higher_pair or not played


def test_invariant_7_all_twelve_positions_are_covered(ranges: RangeIndex) -> None:
    expected_ids = {
        *(f"rfi_6max_{position}" for position in (*POSITION_ORDER["6max"], "SB")),
        *(f"rfi_8max_{position}" for position in (*POSITION_ORDER["8max"], "SB")),
    }
    actual_ids = {range_data.range_id for range_data in ranges.list(spot="rfi")}

    assert actual_ids == expected_ids
    assert all(not range_id.endswith("_BB") for range_id in actual_ids)


def test_shipped_ranges_are_pure_strategies(ranges: RangeIndex) -> None:
    for range_data in ranges.list(spot="rfi"):
        for cell in range_data.grid.values():
            assert not cell or list(cell.values()) == [1.0]


def test_real_borderline_sampling_deemphasizes_aa_and_72o(
    ranges: RangeIndex,
) -> None:
    for range_data in ranges.list(spot="rfi"):
        weights = {
            hand: sampling_weight(hand, range_data.grid) for hand in canonical_hands()
        }
        total_weight = sum(weights.values())
        for hand in ("AA", "72o"):
            assert weights[hand] / total_weight < combos(hand) / TOTAL_COMBOS


def test_constructed_mixed_hand_samples_above_uniform_share() -> None:
    grid = {hand: {} for hand in canonical_hands()}
    grid["A5s"] = {"raise": 0.5}
    weights = {hand: sampling_weight(hand, grid) for hand in canonical_hands()}

    assert weights["A5s"] / sum(weights.values()) > combos("A5s") / TOTAL_COMBOS
