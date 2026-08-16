import pytest

from learner.ranges.loader import load_ranges
from learner.ranges.models import RangeData, played_frequency


@pytest.fixture(scope="module")
def bb_vs_sb_limp() -> RangeData:
    return load_ranges().get("vs_limp_6max_BB_vs_SB")


def test_bb_vs_sb_limp_matches_the_chart_printed_totals(
    bb_vs_sb_limp: RangeData,
) -> None:
    assert bb_vs_sb_limp.stats.by_action == {"raise": 536.0, "check": 790.0}
    assert bb_vs_sb_limp.stats.combos == 1326.0
    assert bb_vs_sb_limp.stats.hands_played == 169
    assert bb_vs_sb_limp.stats.vpip == 1.0


def test_bb_vs_sb_limp_never_folds(bb_vs_sb_limp: RangeData) -> None:
    assert all(
        played_frequency(cell) == 1.0 for cell in bb_vs_sb_limp.grid.values()
    )


def test_bb_vs_sb_limp_premiums_are_pure_raise(bb_vs_sb_limp: RangeData) -> None:
    for hand in ("AA", "KK", "QQ", "AKs"):
        assert bb_vs_sb_limp.grid[hand] == {"raise": 1.0}


def test_bb_vs_sb_limp_actions_and_sizes_match_the_chart(
    bb_vs_sb_limp: RangeData,
) -> None:
    assert bb_vs_sb_limp.actions == ["raise", "check"]
    assert bb_vs_sb_limp.facing_size_bb == 1.0
    assert bb_vs_sb_limp.action_sizes_bb == {"raise": 3.5, "check": 0.0}
