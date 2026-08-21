"""Range content endpoints."""

from typing import Annotated

from fastapi import APIRouter, Depends, Response

from learner.api.v1.dependencies import range_index
from learner.ranges.loader import RangeIndex

router = APIRouter()
Ranges = Annotated[RangeIndex, Depends(range_index)]


@router.get("/ranges")
def list_ranges(
    response: Response,
    ranges: Ranges,
    spot: str | None = None,
    game: str | None = None,
    table_format: str | None = None,
    position: str | None = None,
    vs_position: str | None = None,
) -> dict:
    response.headers["Cache-Control"] = "public, max-age=3600"
    return {
        "ranges": [
            {
                "range_id": item.range_id,
                "spot": item.spot,
                "game": item.game,
                "table_format": item.table_format,
                "position": item.position,
                "vs_position": item.vs_position,
                "stack_bb": item.stack_bb,
                "actions": item.actions,
                "action_sizes_bb": item.action_sizes_bb,
                "facing_size_bb": item.facing_size_bb,
                "source_id": item.source_id,
                "stats": item.stats.model_dump(mode="json"),
            }
            for item in ranges.list(
                spot=spot,
                game=game,
                table_format=table_format,
                position=position,
                vs_position=vs_position,
            )
        ]
    }


@router.get("/ranges/{range_id}")
def get_range(
    range_id: str,
    response: Response,
    ranges: Ranges,
) -> dict:
    response.headers["Cache-Control"] = "public, max-age=3600"
    return ranges.get(range_id).model_dump(mode="json")
