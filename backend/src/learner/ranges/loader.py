"""Strict filesystem loader and index for range data."""

from __future__ import annotations

import json
from collections.abc import Iterable
from pathlib import Path
from types import MappingProxyType
from typing import Any

from pydantic import ValidationError

from learner.errors import LearnerError
from learner.ranges.models import RangeData

DEFAULT_RANGE_DATA_DIR = Path(__file__).resolve().parents[3] / "data" / "ranges"

# Source ids recorded in docs/RESOURCES.md section 2. The fixture id is handled
# separately because it is explicitly forbidden in shipped backend data.
KNOWN_SOURCE_IDS = frozenset(
    {
        "jl-6max-preflop-charts",
        "jl-fullring-preflop-charts",
        "gtowizard-free-study",
        "freebetrange-open-raises",
        "pokerstars-rules",
        "pokerstars-strategy",
        "poker-org-beginner",
        "mit-poker-analytics",
        "poker-academy-equity",
        "equilab",
    }
)

POSITION_ORDER = {
    "6max": ("UTG", "HJ", "CO", "BTN", "SB", "BB"),
    "8max": ("UTG", "UTG1", "LJ", "HJ", "CO", "BTN", "SB", "BB"),
}


class RangeLoadError(ValueError):
    """A range file failed startup validation."""


class RangeIndex:
    """An immutable-by-interface range_id index."""

    def __init__(self, ranges: Iterable[RangeData] = ()) -> None:
        by_id: dict[str, RangeData] = {}
        for item in ranges:
            if item.range_id in by_id:
                raise ValueError(f"Duplicate range id {item.range_id!r}.")
            by_id[item.range_id] = item
        self._by_id = MappingProxyType(by_id)

    def __len__(self) -> int:
        return len(self._by_id)

    def get(self, range_id: str) -> RangeData:
        """Return a range or raise the API contract's domain error."""
        try:
            return self._by_id[range_id]
        except KeyError as exc:
            raise LearnerError(
                code="range_not_found",
                message=f"Unknown range id {range_id}.",
                status_code=404,
            ) from exc

    def list(
        self, *, spot: str | None = None, table_format: str | None = None
    ) -> list[RangeData]:
        """List ranges in table position order with optional contract filters."""
        filtered = [
            item
            for item in self._by_id.values()
            if (spot is None or item.spot == spot)
            and (table_format is None or item.table_format == table_format)
        ]
        return sorted(
            filtered,
            key=lambda item: (
                item.spot,
                item.table_format,
                POSITION_ORDER[item.table_format].index(item.position),
                (
                    -1
                    if item.vs_position is None
                    else POSITION_ORDER[item.table_format].index(item.vs_position)
                ),
            ),
        )


def load_ranges(
    data_dir: str | Path = DEFAULT_RANGE_DATA_DIR,
    *,
    known_source_ids: frozenset[str] = KNOWN_SOURCE_IDS,
) -> RangeIndex:
    """Load and validate every JSON range below a data directory."""
    root = Path(data_dir)
    if not root.exists():
        return RangeIndex()
    if not root.is_dir():
        raise RangeLoadError(f"{root}: range data path must be a directory.")

    ranges: list[RangeData] = []
    seen: dict[str, Path] = {}
    for path in sorted(root.rglob("*.json")):
        item = load_range_file(path, root, known_source_ids=known_source_ids)
        if item.range_id in seen:
            raise RangeLoadError(
                f"{path}: duplicate range_id {item.range_id!r}; "
                f"first seen in {seen[item.range_id]}."
            )
        seen[item.range_id] = path
        ranges.append(item)
    return RangeIndex(ranges)


def load_range_file(
    path: str | Path,
    data_dir: str | Path,
    *,
    known_source_ids: frozenset[str] = KNOWN_SOURCE_IDS,
) -> RangeData:
    """Load one file and validate both its content and path-derived identity."""
    file_path = Path(path)
    root = Path(data_dir)
    try:
        relative = file_path.resolve().relative_to(root.resolve())
    except ValueError as exc:
        raise RangeLoadError(
            f"{file_path}: file is outside range data directory."
        ) from exc
    if len(relative.parts) != 3 or file_path.suffix != ".json":
        raise RangeLoadError(
            f"{file_path}: expected path {{spot}}/{{table_format}}/{{POSITION}}.json."
        )

    try:
        raw: Any = json.loads(file_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise RangeLoadError(f"{file_path}: invalid JSON: {exc}.") from exc
    if not isinstance(raw, dict):
        raise RangeLoadError(f"{file_path}: top-level JSON value must be an object.")

    try:
        item = RangeData.model_validate(raw)
    except ValidationError as exc:
        details = "; ".join(error["msg"] for error in exc.errors())
        raise RangeLoadError(f"{file_path}: invalid range data: {details}") from exc

    if item.source_id == "fixture-illustrative":
        raise RangeLoadError(
            f"{file_path}: source_id 'fixture-illustrative' "
            "is forbidden in backend data."
        )
    if item.source_id not in known_source_ids:
        raise RangeLoadError(
            f"{file_path}: unknown source_id {item.source_id!r}; "
            "register it in docs/RESOURCES.md section 2."
        )

    path_spot, path_format, filename = relative.parts
    path_matchup = Path(filename).stem
    expected_id = f"{path_spot}_{path_format}_{path_matchup}"
    if item.range_id != expected_id:
        raise RangeLoadError(
            f"{file_path}: range_id {item.range_id!r} does not match "
            f"path-derived id {expected_id!r}."
        )
    if path_spot == "vs_rfi" and "_vs_" in path_matchup:
        path_position, path_vs_position = path_matchup.split("_vs_", maxsplit=1)
    else:
        path_position, path_vs_position = path_matchup, None
    if (
        item.spot != path_spot
        or item.table_format != path_format
        or item.position != path_position
        or item.vs_position != path_vs_position
    ):
        raise RangeLoadError(
            f"{file_path}: spot, table_format, position, and vs_position "
            "must match the file path."
        )
    return item
