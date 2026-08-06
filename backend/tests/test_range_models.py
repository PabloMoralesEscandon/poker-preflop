from random import Random

import pytest

from learner.ranges.models import (
    CANONICAL_HAND_SET,
    TOTAL_COMBOS,
    RangeData,
    canonical_hands,
    cards_for_notation,
    combos,
    difficulty_factor,
    grid_coordinates,
    notation_for_cards,
    sampling_weight,
)


def test_canonical_enumeration_is_the_complete_13x13_grid() -> None:
    hands = canonical_hands()

    assert len(hands) == 169
    assert len(set(hands)) == 169
    assert set(hands) == CANONICAL_HAND_SET
    assert hands[:4] == ("AA", "AKs", "AQs", "AJs")
    assert hands[-4:] == ("52o", "42o", "32o", "22")
    assert sum(combos(hand) for hand in hands) == TOTAL_COMBOS


@pytest.mark.parametrize(
    ("notation", "expected"),
    [("AA", 6), ("AKs", 4), ("AKo", 12)],
)
def test_combo_counts(notation: str, expected: int) -> None:
    assert combos(notation) == expected


@pytest.mark.parametrize("notation", ["AAs", "AAo", "KAo", "A1s", "", "AK"])
def test_hand_utilities_reject_noncanonical_notation(notation: str) -> None:
    with pytest.raises(ValueError, match="Non-canonical"):
        combos(notation)


def test_notation_round_trip_covers_all_169_hands() -> None:
    rng = Random(12345)

    for notation in canonical_hands():
        cards = cards_for_notation(notation, rng)
        assert notation_for_cards(cards) == notation


def test_concrete_card_rules_are_exact() -> None:
    rng = Random(7)
    pair = cards_for_notation("AA", rng)
    suited = cards_for_notation("AKs", rng)
    offsuit = cards_for_notation("AKo", rng)

    assert pair[0][0] == pair[1][0] == "A"
    assert pair[0][1] != pair[1][1]
    assert suited[0][1] == suited[1][1]
    assert offsuit[0][1] != offsuit[1][1]
    assert notation_for_cards(["Ks", "Ah"]) == "AKo"
    assert notation_for_cards(["Td", "Ad"]) == "ATs"


@pytest.mark.parametrize(
    "cards",
    [[], ["Ah"], ["Ah", "Ah"], ["AX", "Ks"], ["1h", "Ks"], ["AH", "Ks"]],
)
def test_reverse_notation_rejects_invalid_cards(cards: list[str]) -> None:
    with pytest.raises(ValueError):
        notation_for_cards(cards)


@pytest.mark.parametrize(
    ("notation", "coordinates"),
    [
        ("AA", (0, 0)),
        ("AKs", (0, 1)),
        ("AKo", (1, 0)),
        ("32s", (11, 12)),
        ("32o", (12, 11)),
        ("22", (12, 12)),
    ],
)
def test_grid_coordinates(notation: str, coordinates: tuple[int, int]) -> None:
    assert grid_coordinates(notation) == coordinates


def test_computed_stats_for_a_fully_open_range(range_payload) -> None:
    payload = range_payload()
    payload["grid"] = {hand: {"raise": 1.0} for hand in canonical_hands()}

    range_data = RangeData.model_validate(payload)

    assert range_data.stats.combos == 1326.0
    assert range_data.stats.vpip == 1.0
    assert range_data.stats.hands_played == 169
    assert range_data.model_dump()["stats"] == {
        "combos": 1326.0,
        "vpip": 1.0,
        "hands_played": 169,
    }


def test_borderline_sampling_factors() -> None:
    folded = {hand: {} for hand in canonical_hands()}
    folded["AA"] = {"raise": 1.0}
    mixed = {hand: dict(cell) for hand, cell in folded.items()}
    mixed["A5s"] = {"raise": 0.5}
    fully_open = {hand: {"raise": 1.0} for hand in canonical_hands()}

    assert difficulty_factor("AA", folded) == 4
    assert difficulty_factor("AKs", folded) == 4
    assert difficulty_factor("72o", folded) == 1
    assert difficulty_factor("A5s", mixed) == 6
    assert difficulty_factor("AA", fully_open) == 1
    assert sampling_weight("A5s", mixed) == 24
