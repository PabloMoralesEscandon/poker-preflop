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
            "open_size_bb": 2.5,
            "source_id": "jl-6max-preflop-charts",
            "notes": "Test fixture.",
            "actions": ["raise"],
            "grid": {hand: {} for hand in canonical_hands()},
        }
        payload["grid"]["AA"] = {"raise": 1.0}
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
