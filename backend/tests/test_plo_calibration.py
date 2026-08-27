"""Calibration of the shipped PLO RFI charts against their printed source.

Primary: upswing-plo-rfi-guide (verified 2026-08-21). Every figure asserted
here was printed in the guide; the reconstruction uses the locked taxonomy
and TSQS_ALPHA, so tolerances absorb only print rounding plus the publisher's
own internal inconsistencies.
"""

import hashlib
import json
from pathlib import Path

import pytest

from learner.ranges.loader import RangeIndex
from learner.ranges.models import TOTAL_PLO_COMBOS
from learner.ranges.plo import (
    CLASS_COMBOS,
    TSQS_ALPHA,
    plo_class_keys,
    plo_effective_combos,
)

POSITIONS = ("UTG", "HJ", "CO", "BTN", "SB")

# Guide totals, "% of RFI" header of each position section.
PRINTED_RANGE_TOTALS = {
    "UTG": 17.9,
    "HJ": 21.8,
    "CO": 30.0,
    "BTN": 47.2,
    "SB": 29.7,
}

# plo.com decoded solve (5% rake capped 1bb), RFI summary table.
PLOCOM_OPEN_TOTALS = {
    "UTG": 17.6,
    "HJ": 22.3,
    "CO": 30.5,
    "BTN": 48.6,
    # SB raises 33.6% and limps 6.8%; our charts ship raise-only.
    "SB": 33.6,
}

# Printed ds/ss/r raise frequencies per class row, transcribed from the guide.
PRINTED_ROWS = {
    "UTG": {
        "AA": (100, 100, 100, 2.6),
        "KK": (100, 78, 35, 1.6),
        "QQ": (87, 43, 24, 1.0),
        "JJ": (76, 34, 15, 0.7),
        "TT": (57, 33, 10, 0.7),
        "99-66": (49, 14, 2, 1.5),
        "55-22": (23, 6, 1, 0.7),
        "0G": (90, 71, 20, 0.6),
        "1G": (93, 49, 11, 1.2),
        "2G": (58, 16, 4, 0.5),
        "A-KT": (100, 64, 0, 2.3),
        "A-96": (72, 25, 0, 1.2),
        "A-52": (49, 7, 0, 0.5),
        "OA": (69, 2, 0, 0.7),
        "Oth": (20, 1, 0, 1.4),
    },
    "HJ": {
        "AA": (100, 100, 100, 2.6),
        "KK": (100, 90, 55, 1.9),
        "QQ": (93, 61, 31, 1.5),
        "JJ": (83, 43, 20, 1.1),
        "TT": (71, 36, 17, 1.0),
        "99-66": (57, 20, 3, 2.0),
        "55-22": (32, 7, 1, 0.8),
        "0G": (90, 78, 30, 0.6),
        "1G": (93, 55, 15, 1.4),
        "2G": (61, 19, 8, 0.5),
        "A-KT": (100, 77, 6, 3.0),
        "A-96": (76, 36, 0, 1.6),
        "A-52": (57, 10, 0, 0.7),
        "OA": (81, 10, 0, 1.0),
        "Oth": (25, 1, 0, 1.8),
    },
    "CO": {
        "AA": (100, 100, 100, 2.6),
        "KK": (100, 97, 88, 2.5),
        "QQ": (100, 77, 46, 1.9),
        "JJ": (93, 65, 32, 1.6),
        "TT": (84, 59, 27, 1.4),
        "99-66": (68, 32, 6, 3.1),
        "55-22": (45, 10, 1, 1.2),
        "0G": (90, 80, 30, 0.6),
        "1G": (93, 65, 22, 1.5),
        "2G": (67, 27, 13, 0.7),
        "A-KT": (100, 99, 33, 4.0),
        "A-96": (90, 49, 2, 2.3),
        "A-52": (76, 20, 0, 1.1),
        "OA": (95, 30, 0, 1.9),
        "Oth": (36, 6, 0, 3.5),
    },
    "BTN": {
        "AA": (100, 100, 100, 2.6),
        "KK": (100, 99, 96, 2.6),
        "QQ": (100, 98, 86, 2.4),
        "JJ": (100, 92, 66, 2.2),
        "TT": (100, 83, 63, 2.1),
        "99-66": (90, 58, 19, 5.5),
        "55-22": (76, 28, 3, 2.8),
        "0G": (97, 80, 40, 0.7),
        "1G": (94, 81, 41, 1.9),
        "2G": (72, 48, 29, 1.1),
        "A-KT": (100, 100, 100, 4.3),
        "A-96": (100, 73, 35, 3.5),
        "A-52": (93, 43, 2, 2.1),
        "OA": (100, 77, 6, 4.3),
        "Oth": (60, 20, 3, 9.1),
    },
    "SB": {
        "AA": (33, 84, 93, 2.1),
        "KK": (49, 74, 32, 1.7),
        "QQ": (72, 72, 50, 1.7),
        "JJ": (74, 67, 45, 1.6),
        "TT": (72, 62, 44, 1.4),
        "99-66": (73, 40, 13, 3.8),
        "55-22": (43, 8, 1, 1.1),
        "0G": (67, 52, 30, 0.5),
        "1G": (72, 48, 19, 1.2),
        "2G": (51, 39, 5, 0.8),
        "A-KT": (77, 77, 25, 3.0),
        "A-96": (74, 54, 18, 2.3),
        "A-52": (64, 15, 0, 0.9),
        "OA": (84, 42, 0, 2.3),
        "Oth": (39, 13, 0, 5.4),
    },
}

# Rows whose printed numbers are internally inconsistent with their own
# % of RFI (see RESOURCES.md). Checked with a wide tolerance only.
KNOWN_SOURCE_ANOMALIES = {("SB", "AA")}

RFI_PLO_GRID_DIGESTS = {
    "rfi/plo/6max/BTN.json": (
        "19d87a8dc328f10b198582be69f429c32c26dff563ad602416b4acf7d6309d0a"
    ),
    "rfi/plo/6max/CO.json": (
        "93365b54f91653d6c7ade8c8ba08edc5905413bc95dc3f55d5914358ca127017"
    ),
    "rfi/plo/6max/HJ.json": (
        "162decfb7f2aad5234f2921fabd2dc99d041dbebeb39a5f200bfccd6a28c55a3"
    ),
    "rfi/plo/6max/SB.json": (
        "fefd166d5c96dcc26f02d9f0a9bdf1beb0cbac6ab55ade8d61f3d4be9da586f2"
    ),
    "rfi/plo/6max/UTG.json": (
        "97048cda0da1e7c1b5fcc4b65033fa922cf7aecdee9fdcb24ad2a2257ed626a1"
    ),
}


@pytest.fixture(scope="module")
def ranges() -> RangeIndex:
    from learner.ranges.loader import load_ranges

    return load_ranges()


def _row_share(range_data, row: tuple[str, str]) -> float:
    """Reconstructed % Dealt for one class row across its three textures."""
    mass = sum(
        range_data.grid[f"{row}.{tex}"].get("raise", 0.0)
        * plo_effective_combos(f"{row}.{tex}")
        for tex in ("ds", "ss", "r")
    )
    return mass / TOTAL_PLO_COMBOS * 100


def test_all_five_plo_positions_ship(ranges: RangeIndex) -> None:
    ids = {item.range_id for item in ranges.list(spot="rfi", game="plo")}
    assert ids == {f"rfi_plo_6max_{pos}" for pos in POSITIONS}


def test_grid_digests_pin_the_transcription() -> None:
    data_root = Path(__file__).resolve().parents[1] / "data" / "ranges"
    actual: dict[str, str] = {}
    for path in sorted((data_root / "rfi" / "plo").rglob("*.json")):
        payload = json.loads(path.read_text(encoding="utf-8"))
        encoded = json.dumps(
            payload["grid"], sort_keys=True, separators=(",", ":")
        ).encode()
        actual[str(path.relative_to(data_root))] = hashlib.sha256(encoded).hexdigest()
    assert actual == RFI_PLO_GRID_DIGESTS


@pytest.mark.parametrize("position", POSITIONS)
def test_reconstructed_vpip_matches_the_printed_range_total(
    ranges: RangeIndex, position: str
) -> None:
    range_data = ranges.get(f"rfi_plo_6max_{position}")
    # Publisher rounding across 15 rows accumulates; worst observed 1.34pp.
    assert abs(range_data.stats.vpip * 100 - PRINTED_RANGE_TOTALS[position]) <= 1.5


@pytest.mark.parametrize("position", POSITIONS)
def test_totals_track_the_plocom_cross_check(ranges: RangeIndex, position: str) -> None:
    range_data = ranges.get(f"rfi_plo_6max_{position}")
    ours = range_data.stats.vpip * 100
    theirs = PLOCOM_OPEN_TOTALS[position]
    # Different solves, rake structures, and an SB limp branch widen this.
    assert abs(ours - theirs) <= 4.0, f"{position}: {ours:.2f}% vs {theirs}%"


@pytest.mark.parametrize(("position", "rows"), sorted(PRINTED_ROWS.items()))
def test_every_printed_row_reconstructs_within_rounding(
    ranges: RangeIndex, position: str, rows: dict[str, tuple[int, int, int]]
) -> None:
    range_data = ranges.get(f"rfi_plo_6max_{position}")
    for row in rows:
        predicted = _row_share(range_data, row)
        printed = _printed_dealt(position, row)
        # Fitting envelope: mean |delta| 0.12 pp, worst row 0.65 pp.
        tolerance = 1.2 if (position, row) in KNOWN_SOURCE_ANOMALIES else 0.7
        assert abs(predicted - printed) <= tolerance, (
            position,
            row,
            f"predicted {predicted:.2f}% vs printed {printed:.2f}%",
        )


def _printed_dealt(position: str, row: str) -> float:
    """The guide's own "% Dealt" figure for one class row."""
    return PRINTED_ROWS[position][row][3]


def test_trips_and_quads_fold_at_every_position(ranges: RangeIndex) -> None:
    for position in POSITIONS:
        grid = ranges.get(f"rfi_plo_6max_{position}").grid
        assert grid["Trips"] == {}
        assert grid["Quads"] == {}


def test_raise_is_the_only_non_fold_action(ranges: RangeIndex) -> None:
    for item in ranges.list(spot="rfi", game="plo"):
        assert item.actions == ["raise"]
        assert item.action_sizes_bb["raise"] > 0.0


def test_effective_weights_sum_below_the_deck() -> None:
    total_effective = sum(plo_effective_combos(key) for key in plo_class_keys())
    assert total_effective < TOTAL_PLO_COMBOS
    tri_quad = sum(counts["ts"] + counts["qs"] for counts in CLASS_COMBOS.values())
    discount = TOTAL_PLO_COMBOS - total_effective
    assert discount == pytest.approx((1 - TSQS_ALPHA) * tri_quad)
