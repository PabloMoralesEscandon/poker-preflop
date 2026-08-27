import copy
import json
from collections.abc import Callable
from pathlib import Path
from typing import Any

import pytest

from learner.ranges.models import canonical_hands


@pytest.fixture
def range_payload() -> Callable[..., dict[str, Any]]:
    def factory(**overrides: Any) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "range_id": "rfi_6max_CO",
            "spot": "rfi",
            "table_format": "6max",
            "position": "CO",
            "stack_bb": 100,
            "source_id": "jl-6max-preflop-charts",
            "notes": "Test fixture.",
            "actions": ["raise"],
            "action_sizes_bb": {"raise": 2.5},
            "grid": {hand: {} for hand in canonical_hands()},
        }
        payload["grid"]["AA"] = {"raise": 1.0}
        payload.update(overrides)
        return copy.deepcopy(payload)

    return factory


@pytest.fixture
def matchup_range_payload(
    range_payload: Callable[..., dict[str, Any]],
) -> Callable[..., dict[str, Any]]:
    def factory(**overrides: Any) -> dict[str, Any]:
        payload = range_payload(
            range_id="vs_rfi_6max_BB_vs_BTN",
            spot="vs_rfi",
            position="BB",
            vs_position="BTN",
            facing_size_bb=2.5,
            actions=["3bet", "call"],
            action_sizes_bb={"3bet": 4.0, "call": 2.5},
        )
        payload["grid"]["AA"] = {"3bet": 1.0}
        payload["grid"]["KQs"] = {"call": 1.0}
        payload.update(overrides)
        return copy.deepcopy(payload)

    return factory


@pytest.fixture
def limp_range_payload(
    range_payload: Callable[..., dict[str, Any]],
) -> Callable[..., dict[str, Any]]:
    def factory(**overrides: Any) -> dict[str, Any]:
        payload = range_payload(
            range_id="vs_limp_6max_BB_vs_SB",
            spot="vs_limp",
            position="BB",
            vs_position="SB",
            facing_size_bb=1.0,
            actions=["raise", "check"],
            action_sizes_bb={"raise": 3.5, "check": 0.0},
            grid={hand: {"check": 1.0} for hand in canonical_hands()},
        )
        payload["grid"]["AA"] = {"raise": 1.0}
        payload.update(overrides)
        return copy.deepcopy(payload)

    return factory


@pytest.fixture
def three_bet_range_payload(
    range_payload: Callable[..., dict[str, Any]],
) -> Callable[..., dict[str, Any]]:
    """A minimal `vs_3bet` file: hero opened four hands and now decides."""

    def factory(**overrides: Any) -> dict[str, Any]:
        payload = range_payload(
            range_id="vs_3bet_8max_UTG_vs_BTN",
            spot="vs_3bet",
            table_format="8max",
            position="UTG",
            vs_position="BTN",
            facing_size_bb=10.0,
            hero_committed_bb=3.0,
            actions=["call", "4bet"],
            action_sizes_bb={"call": 10.0, "4bet": 24.0},
            reach=["AA", "KK", "AKs", "72s"],
            grid={hand: {} for hand in canonical_hands()},
        )
        payload["grid"]["AA"] = {"4bet": 1.0}
        payload["grid"]["KK"] = {"4bet": 0.6, "call": 0.4}
        payload["grid"]["AKs"] = {"call": 1.0}
        # In reach and folded outright: opened, then given up to the 3-bet.
        payload["grid"]["72s"] = {}
        payload.update(overrides)
        return copy.deepcopy(payload)

    return factory


@pytest.fixture
def range_writer(
    tmp_path: Path,
) -> Callable[[dict[str, Any], str], tuple[Path, Path]]:
    root = tmp_path / "ranges"

    def write(
        payload: dict[str, Any], relative: str = "rfi/6max/CO.json"
    ) -> tuple[Path, Path]:
        path = root / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(payload), encoding="utf-8")
        return root, path

    return write
