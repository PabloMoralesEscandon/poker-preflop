"""Tests for the PLO class engine in learner.ranges.plo."""

from random import Random

import pytest

from learner.ranges import plo


def test_class_universe_has_47_keys() -> None:
    keys = plo.plo_class_keys()
    assert len(keys) == 47
    assert len(set(keys)) == 47
    assert plo.plo_class_key_set() == set(keys)


def test_class_combo_counts_sum_to_the_full_deck() -> None:
    total = sum(plo.plo_combos(key) for key in plo.plo_class_keys())
    assert total == plo.TOTAL_PLO_COMBOS == 270_725


def test_effective_combos_never_exceed_availability() -> None:
    for key in plo.plo_class_keys():
        assert plo.plo_effective_combos(key) <= plo.plo_combos(key)


def test_texture_freeze_matches_analytic_identities() -> None:
    # nine ace-less runs; per run r=24, ds=36, and the ss cell absorbs ts/qs
    assert plo.CLASS_COMBOS["0G.r"]["r"] == 9 * 24
    assert plo.CLASS_COMBOS["0G.ds"]["ds"] == 9 * 36
    ss_cell = plo.CLASS_COMBOS["0G.ss"]
    assert (ss_cell["ss"], ss_cell["ts"], ss_cell["qs"]) == (
        9 * 144,
        9 * 48,
        9 * 4,
    )
    # quads are always rainbow and there are exactly thirteen of them
    assert plo.CLASS_COMBOS["Quads"] == {
        "r": 13,
        "ss": 0,
        "ds": 0,
        "ts": 0,
        "qs": 0,
    }


@pytest.mark.parametrize(
    ("cards", "expected"),
    [
        (("As", "Ah", "Ks", "Qh"), "AA.ds"),
        (("As", "Ah", "Kd", "Qc"), "AA.r"),
        (("As", "Ah", "Ks", "Qs"), "AA.ss"),
        (("Kh", "Kd", "Qh", "Qd"), "KK.ds"),
        (("7h", "7d", "7c", "2s"), "Trips"),
        (("As", "Ks", "Qs", "Js"), "OA.ss"),
        (("As", "Ah", "Ad", "Ac"), "Quads"),
        (("Ks", "Qh", "Jd", "Tc"), "0G.r"),
        (("As", "Ts", "9h", "8d"), "A-96.ss"),
        (("As", "5h", "3d", "2c"), "A-52.r"),
        (("7s", "6h", "5d", "4c"), "0G.r"),
        (("9s", "8h", "7d", "5c"), "1G.r"),
        (("9s", "8h", "5d", "4c"), "2G.r"),
        (("9s", "7h", "5d", "4c"), "Oth.r"),
        (("Ks", "Qs", "Jh", "8d"), "2G.ss"),
    ],
)
def test_golden_classifications(cards: tuple[str, ...], expected: str) -> None:
    assert plo.classify(list(cards)) == expected


def test_classify_rejects_bad_input() -> None:
    for cards in ([], ["As"] * 4, ["As", "Kh", "Qd"], ["Ax", "Kh", "Qd", "Jc"]):
        with pytest.raises(ValueError):
            plo.classify(cards)  # type: ignore[arg-type]


def test_uniform_deals_cover_every_class_and_round_trip() -> None:
    rng = Random(2026)
    seen: set[str] = set()
    for _ in range(2000):
        hand = plo.deal_concrete(rng)
        assert len(set(hand)) == 4
        key = plo.classify(hand)
        assert key in plo.plo_class_key_set()
        seen.add(key)
    assert len(seen) > 25


def test_within_class_deal_stays_in_class() -> None:
    rng = Random(7)
    for key in ("AA.ds", "0G.ss", "Oth.r", "Trips", "Quads"):
        for _ in range(20):
            hand = plo.plo_cards_for_class(key, rng)
            assert plo.classify(hand) == key


def test_neighbors_stay_inside_the_universe() -> None:
    for key in plo.plo_class_keys():
        for neighbour in plo.plo_neighbors(key):
            assert neighbour in plo.plo_class_key_set(), (key, neighbour)
    assert plo.plo_neighbors("Trips") == []
    assert plo.plo_neighbors("Quads") == []
    # texture chain is ds <-> ss <-> r; shape ladder steps both ways
    assert plo.plo_neighbors("AA.ds") == ["AA.ss", "KK.ds"]
    assert plo.plo_neighbors("55-22.r") == ["55-22.ss", "99-66.r"]
    assert plo.plo_neighbors("1G.ss") == ["1G.ds", "1G.r", "0G.ss", "2G.ss"]


GRID_MIXED = {
    **{key: {} for key in plo.plo_class_keys()},
    "AA.ss": {"raise": 0.5},
    "KK.ds": {"raise": 1.0},
    "KK.ss": {},
    "0G.ds": {"raise": 1.0},
}


def test_difficulty_factor_mixed_boundary_plain() -> None:
    assert plo.plo_difficulty_factor("AA.ss", GRID_MIXED) == 6
    # KK.ds is pure-played next to the folded KK.ss cell
    assert plo.plo_difficulty_factor("KK.ds", GRID_MIXED) == 4
    # KK.ss is a pure fold next to the played AA.ss and KK.ds cells
    assert plo.plo_difficulty_factor("KK.r", GRID_MIXED) == 1
    assert plo.plo_difficulty_factor("TT.ss", GRID_MIXED) == 1
    assert plo.plo_difficulty_factor("Trips", GRID_MIXED) == 1


def test_sampling_weights_multiply_availability() -> None:
    weight = plo.plo_sampling_weight("AA.ss", GRID_MIXED)
    assert weight == plo.plo_combos("AA.ss") * 6
