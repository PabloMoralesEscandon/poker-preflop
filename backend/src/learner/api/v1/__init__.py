"""Version 1 API router."""

from fastapi import APIRouter

from learner import __version__
from learner.api.v1.drills import router as drills_router
from learner.api.v1.ranges import router as ranges_router
from learner.api.v1.sessions import router as sessions_router

router = APIRouter(prefix="/api/v1")


@router.get("/health")
async def health() -> dict[str, str]:
    """Report service health and the deployed API version."""
    return {"status": "ok", "version": __version__}


router.include_router(drills_router)
router.include_router(sessions_router)
router.include_router(ranges_router)
