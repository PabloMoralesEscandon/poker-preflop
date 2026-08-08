"""Source provenance endpoint."""

from fastapi import APIRouter, Response

from learner.sources import SOURCES

router = APIRouter()


@router.get("/sources")
def list_sources(response: Response) -> dict:
    """Return the source register used by the chart browser."""
    response.headers["Cache-Control"] = "public, max-age=3600"
    return {
        "sources": [source.model_dump(mode="json") for source in SOURCES],
    }
