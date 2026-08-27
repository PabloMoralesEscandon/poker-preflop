from random import Random

import pytest
from pydantic import ValidationError

from learner.ranges.loader import load_ranges
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
        "by_action": {"raise": 1326.0},
        "reach_combos": 1326.0,
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
    assert difficulty_factor("AA", fully_open) == 1
    assert sampling_weight("A5s", mixed) == 24


def test_mixed_frequency_fixture_keeps_factor_six() -> None:
    grid = {hand: {} for hand in canonical_hands()}
    grid["A5s"] = {"raise": 0.5}

    assert difficulty_factor("A5s", grid) == 6


def test_real_co_borderline_sampling_deemphasizes_obvious_hands() -> None:
    grid = load_ranges().get("rfi_6max_CO").grid
    weights = {hand: sampling_weight(hand, grid) for hand in canonical_hands()}
    total_weight = sum(weights.values())

    for hand in ("AA", "72o"):
        borderline_share = weights[hand] / total_weight
        uniform_share = combos(hand) / TOTAL_COMBOS
        assert borderline_share < uniform_share


class TestFacingAThreeBet:
    """`vs_3bet` adds two fields, and both carry a fact nothing else supplies."""

    def test_accepts_a_well_formed_matchup(self, three_bet_range_payload) -> None:
        item = RangeData.model_validate(three_bet_range_payload())

        assert item.spot == "vs_3bet"
        assert item.hero_committed_bb == 3.0
        assert item.reach == ["AA", "KK", "AKs", "72s"]

    def test_reach_narrows_the_stats_denominator(self, three_bet_range_payload) -> None:
        item = RangeData.model_validate(three_bet_range_payload())

        # 6 + 6 + 4 + 4 combos reach the spot; the other 1306 never opened.
        assert item.stats.reach_combos == 20.0
        assert item.stats.by_action == {"call": 6.4, "4bet": 9.6}

    def test_other_spots_report_the_whole_deal_as_reach(self, range_payload) -> None:
        item = RangeData.model_validate(range_payload())

        assert item.reach is None
        assert item.stats.reach_combos == 1326.0

    @pytest.mark.parametrize(
        ("overrides", "message"),
        [
            ({"hero_committed_bb": None}, "hero_committed_bb is required"),
            ({"reach": None}, "reach is required"),
            ({"hero_committed_bb": 12.0}, "smaller than the 3-bet"),
            ({"hero_committed_bb": 0.0}, "smaller than the 3-bet"),
            ({"reach": []}, "reach must be non-empty"),
            ({"reach": ["AA", "AA"]}, "must not contain duplicates"),
            ({"reach": ["AAs"]}, "non-canonical"),
            ({"table_format": "6max"}, "only 8max"),
        ],
    )
    def test_rejects_a_malformed_matchup(
        self, three_bet_range_payload, overrides, message
    ) -> None:
        payload = three_bet_range_payload(**overrides)
        if overrides.get("table_format") == "6max":
            payload["range_id"] = "vs_3bet_6max_UTG_vs_BTN"

        with pytest.raises(ValidationError) as excinfo:
            RangeData.model_validate(payload)
        assert message in str(excinfo.value)

    def test_rejects_a_hand_that_acts_without_being_opened(
        self, three_bet_range_payload
    ) -> None:
        """The chart draws these as two different colours; `{}` alone loses that."""
        payload = three_bet_range_payload()
        payload["grid"]["32o"] = {"call": 1.0}

        with pytest.raises(ValidationError) as excinfo:
            RangeData.model_validate(payload)
        assert "outside reach" in str(excinfo.value)

    def test_rejects_a_three_bettor_who_acts_before_the_opener(
        self, three_bet_range_payload
    ) -> None:
        payload = three_bet_range_payload(
            range_id="vs_3bet_8max_BTN_vs_UTG",
            position="BTN",
            vs_position="UTG",
        )

        with pytest.raises(ValidationError) as excinfo:
            RangeData.model_validate(payload)
        assert "must act after the opener" in str(excinfo.value)

    def test_rejects_the_big_blind_as_the_opener(self, three_bet_range_payload) -> None:
        payload = three_bet_range_payload(
            range_id="vs_3bet_8max_BB_vs_SB", position="BB", vs_position="SB"
        )

        with pytest.raises(ValidationError) as excinfo:
            RangeData.model_validate(payload)
        assert "cannot open" in str(excinfo.value)

    @pytest.mark.parametrize("field", ["hero_committed_bb", "reach"])
    def test_other_spots_may_not_carry_the_new_fields(
        self, matchup_range_payload, field
    ) -> None:
        payload = matchup_range_payload(
            **{field: 2.0 if field == "hero_committed_bb" else ["AA"]}
        )

        with pytest.raises(ValidationError) as excinfo:
            RangeData.model_validate(payload)
        assert f"{field} must be absent" in str(excinfo.value)
