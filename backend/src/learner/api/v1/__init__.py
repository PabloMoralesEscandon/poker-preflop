"""Version 1 API router."""

from fastapi import APIRouter

from learner import __version__

router = APIRouter(prefix="/api/v1")


@router.get("/health")
async def health() -> dict[str, str]:
    """Report service health and the deployed API version."""
    return {"status": "ok", "version": __version__}
