"""Acceptance checks for the `vs_3bet` range data.

See `docs/ranges/VS-3BET-CALIBRATION.md`. The source states four percentages
under every grid and those are the criterion; the tolerance exists because the
guide draws mixed strategies as bands and a band can only be measured to about
a pixel.
"""

import hashlib
import json
from pathlib import Path

import pytest

from learner.ranges.loader import load_ranges
from learner.ranges.models import RangeData, combos, played_frequency

DATA_DIR = Path(__file__).resolve().parents[1] / "data" / "ranges" / "vs_3bet" / "8max"

PRINTED = {
    # matchup: (all-in %, 4-bet size bb, 4-bet %, call %, fold %)
    # Read off pages 13-17 of the guide, verbatim. These are the acceptance
    # figures; nothing here is derived from our own files.
    "UTG_vs_UTG1": (0.01, 24.0, 14.92, 28.37, 56.70),
    "UTG_vs_LJ": (0.04, 24.0, 15.12, 28.77, 56.07),
    "UTG_vs_HJ": (0.03, 24.0, 15.05, 31.52, 53.41),
    "UTG_vs_CO": (0.03, 24.0, 15.19, 33.42, 51.36),
    "UTG_vs_BTN": (0.22, 24.0, 15.40, 34.45, 49.93),
    "UTG_vs_SB": (0.01, 27.0, 8.94, 39.73, 51.32),
    "UTG_vs_BB": (0.01, 27.0, 8.97, 42.16, 48.86),
    "UTG1_vs_LJ": (0.91, 24.0, 13.69, 28.88, 56.53),
    "UTG1_vs_HJ": (1.47, 24.0, 13.55, 28.57, 56.41),
    "UTG1_vs_CO": (1.10, 24.0, 14.22, 31.30, 53.38),
    "UTG1_vs_BTN": (1.05, 24.0, 14.10, 33.94, 50.91),
    "UTG1_vs_SB": (0.17, 27.0, 9.97, 40.27, 49.58),
    "UTG1_vs_BB": (0.10, 27.0, 8.04, 42.63, 49.22),
    "LJ_vs_HJ": (2.95, 24.0, 11.78, 27.04, 58.23),
    "LJ_vs_CO": (2.52, 24.0, 12.46, 28.73, 56.29),
    "LJ_vs_BTN": (2.33, 24.0, 12.94, 31.13, 53.59),
    "LJ_vs_SB": (1.07, 27.0, 6.65, 40.04, 52.24),
    "LJ_vs_BB": (1.00, 27.0, 6.39, 40.88, 51.72),
    "HJ_vs_CO": (1.35, 24.0, 14.32, 25.44, 58.89),
    "HJ_vs_BTN": (1.39, 24.0, 14.32, 29.46, 54.84),
    "HJ_vs_SB": (1.33, 27.0, 6.23, 41.95, 50.50),
    "HJ_vs_BB": (2.18, 27.0, 5.02, 44.03, 48.78),
    "CO_vs_BTN": (0.12, 24.0, 16.57, 23.93, 59.39),
    "CO_vs_SB": (0.05, 27.0, 7.76, 36.80, 55.39),
    "CO_vs_BB": (0.43, 27.0, 7.25, 38.94, 53.39),
    "BTN_vs_SB": (1.16, 27.0, 7.30, 34.01, 57.53),
    "BTN_vs_BB": (0.52, 27.0, 7.99, 37.28, 54.21),
    "SB_vs_BB": (0.09, 26.8, 20.96, 26.29, 52.66),
}

# One rendered column of a cell is roughly 0.7% of its width, and a grid holds
# 169 of them, so a per-grid aggregate can drift by a few tenths of a point.
# The measured worst case across all 112 figures is 0.48; this is that with
# room to breathe, and a number that grows is a finding, not a knob.
TOLERANCE_PP = 0.6

# Read off the RFI pages (4-5) and the vs-RFI pages (8-12): what hero opened
# to, and what the 3-bet costs when it comes from each seat.
OPEN_BB = {
    "UTG": 3.0,
    "UTG1": 3.0,
    "LJ": 3.0,
    "HJ": 3.0,
    "CO": 3.0,
    "BTN": 3.0,
    "SB": 4.0,
}
THREE_BET_BB = {
    "UTG1": 10.0,
    "LJ": 10.0,
    "HJ": 10.0,
    "CO": 10.0,
    "BTN": 10.0,
    "SB": 12.0,
    "BB": 12.0,
}
PREMIUMS = ("AA", "KK", "QQ", "AKs", "AKo")
# Frequencies are stored to two decimals, so a hand the chart never folds can
# still read as 0.98 played once its bands are rounded. That is rounding, not a
# fold, and the invariant is written to say so rather than to be defeated by it.
ROUNDING_SLACK = 0.03

VS_3BET_GRID_DIGESTS = {
    "BTN_vs_BB.json": (
        "2e9230bd5c26eecc7113b28d22d05b126d890918e1bdfe3f37a0f10cc0c93897"
    ),
    "BTN_vs_SB.json": (
        "0fbb5c4945466dcd87595872010ef13993e93769a1cc1c022cfd24048e0081c0"
    ),
    "CO_vs_BB.json": (
        "e47a10303abf416adba678b692e7e19422ff6e3bb1222d4033a745c58f34a14a"
    ),
    "CO_vs_BTN.json": (
        "0a8dd4a3a586faf7d31f7630fbf866320724b014dd43b4109fe22484e5bf3bcf"
    ),
    "CO_vs_SB.json": (
        "099b33cc28d626e08d6b33b4225b397677aed1152f7e7d764af58b76baa9c03d"
    ),
    "HJ_vs_BB.json": (
        "9c58e192d56f96cb49d0db299e8a20d7d878591471ed9d1f104c9708e6308f2d"
    ),
    "HJ_vs_BTN.json": (
        "eb5b6b3d1e1cae9a67675a6d284dea9d4e1825aa519315a12936b4530dc382bc"
    ),
    "HJ_vs_CO.json": (
        "0b28bc29189d0717b8ae7ecf51983e3a7f3179b8d0193a082f3c96f3075142f8"
    ),
    "HJ_vs_SB.json": (
        "5deaca084f05dc1aabbb8dc0e443d09938123d8a0f51c9176bcc43e9a846aa7a"
    ),
    "LJ_vs_BB.json": (
        "a48140b7e857a070150addf6914719552daa8ee1438207c271f05023952b542f"
    ),
    "LJ_vs_BTN.json": (
        "c63d4736c3bb3e6dee4151930572b6d1bb12168cb85ba7b9dd7c659e170b21e6"
    ),
    "LJ_vs_CO.json": (
        "00b14d1aec1a51ce16ac4face454a7c39a8390e551884b2d8c4f7aa743cb4cf4"
    ),
    "LJ_vs_HJ.json": (
        "e83125618f400e49b888bf7a3b76fd6da4218a1a31c1123c12a540d823702b5f"
    ),
    "LJ_vs_SB.json": (
        "825e939035b6a6b35a856d11e6ac75aa26947f80d0c86693736e33605defa328"
    ),
    "SB_vs_BB.json": (
        "9b961eeb2e60f04252bb3ea8da17b68f563ab2f8d16c95b3bbfcd1877a077065"
    ),
    "UTG1_vs_BB.json": (
        "a092bf365aba0ef10c5ebaeadc90d798ff86a628013ed2114eb0b5dff18acb0a"
    ),
    "UTG1_vs_BTN.json": (
        "ed13be5dc459b2e09a66a17bb6b2b9df8a8d6d9834c8c681d175d1d26936bed6"
    ),
    "UTG1_vs_CO.json": (
        "2ee351c6533d3c0ca2633fb85a9f163a19dbb1656c2ce155a915a244f4d1ce46"
    ),
    "UTG1_vs_HJ.json": (
        "104ef599b9b6f9829b0a65b524c231b8e035fd939aa4188346551fefb0b80ff7"
    ),
    "UTG1_vs_LJ.json": (
        "da1cd2f0e9f4ebb7d5939513d86cb5fc0ba0bc48fcbec11f7ed8a9643eba0dba"
    ),
    "UTG1_vs_SB.json": (
        "9b7c98c36f934ea251b3057dd4174de70b4b1ce45b569bd3f5868da8a835537b"
    ),
    "UTG_vs_BB.json": (
        "99347f3c80d2fc9c45e36534d644f42d5167e282b8fbc6852fceef0eafe353d2"
    ),
    "UTG_vs_BTN.json": (
        "be5b7dbbff7c93bcc8e9c227e296c1c29fca493c4c1dc67e4bf782ee92b9cbce"
    ),
    "UTG_vs_CO.json": (
        "b38ae143098dc16ce6d903a74cf8914fcf5b992e603e45f4e89f19552fd6a13a"
    ),
    "UTG_vs_HJ.json": (
        "90b37d01970562ee638638d97fec5ee83f26fe756c9232b7b010d5e01d5b473b"
    ),
    "UTG_vs_LJ.json": (
        "05cfedc1f36601e1fecc32b760e1554b99bcd87e959bfae1e52bd57c1be98f28"
    ),
    "UTG_vs_SB.json": (
        "a8535a54cd8d77bf5378f5b59ed03d7c95ab92cf6fd6a12c2d037becdbc979b7"
    ),
    "UTG_vs_UTG1.json": (
        "ad8bc7a0ccc5714e82277d50c9f0da080adc878cdd8190f850d97d52c5a2176a"
    ),
}


def load_vs_3bet() -> dict[str, RangeData]:
    index = load_ranges()
    return {
        item.range_id.removeprefix("vs_3bet_8max_"): item
        for item in index.list(spot="vs_3bet")
    }


@pytest.fixture(scope="module")
def ranges() -> dict[str, RangeData]:
    return load_vs_3bet()


def test_every_matchup_in_the_guide_ships_and_nothing_else_does(
    ranges: dict[str, RangeData],
) -> None:
    assert set(ranges) == set(PRINTED)
    assert len(ranges) == 28


@pytest.mark.parametrize("matchup", sorted(PRINTED))
def test_computed_percentages_match_the_printed_ones(
    ranges: dict[str, RangeData], matchup: str
) -> None:
    """The chart already did this arithmetic; we only have to agree with it."""
    item = ranges[matchup]
    allin, _size, four_bet, call, fold = PRINTED[matchup]
    reach_combos = item.stats.reach_combos
    assert reach_combos > 0

    ours = {
        action: 100 * item.stats.by_action.get(action, 0.0) / reach_combos
        for action in ("allin", "4bet", "call")
    }
    ours["fold"] = 100 - sum(ours.values())

    for action, expected in (
        ("allin", allin),
        ("4bet", four_bet),
        ("call", call),
        ("fold", fold),
    ):
        assert abs(ours[action] - expected) <= TOLERANCE_PP, (
            f"{matchup} {action}: chart prints {expected}%, we compute "
            f"{ours[action]:.2f}%"
        )


def test_sub_pixel_actions_are_absent_rather_than_invented(
    ranges: dict[str, RangeData],
) -> None:
    """A shove printed at 0.01% is drawn thinner than one pixel.

    Where that happens the action is simply not in the file. The alternative --
    adding a cell to make a total match -- would be inventing data to satisfy a
    test, which is the one thing this suite exists to prevent.
    """
    absent = {
        matchup for matchup, item in ranges.items() if "allin" not in item.actions
    }
    assert absent, "expected at least one chart whose shove is below the ink"
    for matchup in absent:
        printed_allin = PRINTED[matchup][0]
        assert printed_allin < TOLERANCE_PP, (
            f"{matchup} prints {printed_allin}% all-in but ships none of it"
        )


def test_one_hero_has_one_opening_range(ranges: dict[str, RangeData]) -> None:
    """The invariant that caught the only real defect in this transcription.

    Hero's `reach` is their opening range, so it cannot depend on who 3-bet
    them. When two grids on page 15 were paired with each other's titles, every
    printed percentage still agreed within tolerance -- because both grids were
    real, just swapped. This is what noticed.
    """
    by_hero: dict[str, set[tuple[str, ...]]] = {}
    for item in ranges.values():
        assert item.reach is not None
        by_hero.setdefault(item.position, set()).add(tuple(item.reach))

    for hero, distinct in sorted(by_hero.items()):
        assert len(distinct) == 1, (
            f"{hero} has {len(distinct)} different opening ranges across its "
            "matchups; two grids are probably paired with the wrong titles"
        )


def test_opening_ranges_widen_with_position(ranges: dict[str, RangeData]) -> None:
    """Later seats open more hands. Reported, not enforced by adjustment."""
    order = ("UTG", "UTG1", "LJ", "HJ", "CO", "BTN")
    reach_combos = {}
    for item in ranges.values():
        assert item.reach is not None
        reach_combos[item.position] = sum(combos(hand) for hand in item.reach)

    widths = [reach_combos[seat] for seat in order]
    assert widths == sorted(widths), f"opening widths are not monotonic: {widths}"


def test_sizes_are_the_ones_printed_on_each_grid(
    ranges: dict[str, RangeData],
) -> None:
    for matchup, item in ranges.items():
        assert item.vs_position is not None
        assert item.hero_committed_bb == OPEN_BB[item.position]
        assert item.facing_size_bb == THREE_BET_BB[item.vs_position]
        assert item.action_sizes_bb["call"] == item.facing_size_bb
        assert item.action_sizes_bb["4bet"] == PRINTED[matchup][1]
        if "allin" in item.actions:
            assert item.action_sizes_bb["allin"] == item.stack_bb


def test_premiums_are_never_given_up(ranges: dict[str, RangeData]) -> None:
    for matchup, item in ranges.items():
        assert item.reach is not None
        for hand in PREMIUMS:
            assert hand in item.reach, f"{matchup}: {hand} is not even opened"
            played = played_frequency(item.grid[hand])
            assert played >= 1.0 - ROUNDING_SLACK, (
                f"{matchup}: {hand} continues only {played:.0%} of the time"
            )


def test_hands_hero_never_opened_take_no_action(
    ranges: dict[str, RangeData],
) -> None:
    for matchup, item in ranges.items():
        assert item.reach is not None
        unreached = set(item.grid) - set(item.reach)
        assert unreached, f"{matchup}: every hand reaches the spot, which cannot be"
        for hand in unreached:
            assert item.grid[hand] == {}, (
                f"{matchup}: {hand} acts without ever having been opened"
            )


def test_action_ids_stay_inside_the_spot(ranges: dict[str, RangeData]) -> None:
    for item in ranges.values():
        assert set(item.actions) <= {"call", "4bet", "allin"}
        assert set(item.action_sizes_bb) == set(item.actions)


def test_grids_are_frozen() -> None:
    """A digest per file, so a re-measurement cannot land unnoticed.

    Re-deriving this data is legitimate; doing it silently is not. If one of
    these changes, say which grid and why in the calibration document.
    """
    for path in sorted(DATA_DIR.glob("*.json")):
        grid = json.loads(path.read_text(encoding="utf-8"))["grid"]
        digest = hashlib.sha256(
            json.dumps(grid, sort_keys=True, separators=(",", ":")).encode()
        ).hexdigest()
        assert digest == VS_3BET_GRID_DIGESTS[path.name], f"{path.name} changed"
