"""Range content endpoints."""

from typing import Annotated

from fastapi import APIRouter, Depends, Response

from learner.api.v1.dependencies import range_index
from learner.ranges.loader import RangeIndex

router = APIRouter()
Ranges = Annotated[RangeIndex, Depends(range_index)]


@router.get("/ranges")
def list_ranges(
    ranges: Ranges,
    spot: str | None = None,
    table_format: str | None = None,
) -> dict:
    return {
        "ranges": [
            {
                "range_id": item.range_id,
                "spot": item.spot,
                "table_format": item.table_format,
                "position": item.position,
                "stack_bb": item.stack_bb,
            }
            for item in ranges.list(spot=spot, table_format=table_format)
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
