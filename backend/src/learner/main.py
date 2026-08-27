"""FastAPI application setup."""

import os
from collections.abc import Sequence
from pathlib import Path
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from learner import __version__
from learner.api.v1 import router as v1_router
from learner.drills.bvb import BvbDrill
from learner.drills.registry import DrillRegistry
from learner.drills.rfi import RfiDrill
from learner.drills.vs_3bet import Vs3BetDrill
from learner.drills.vs_rfi import VsRfiDrill
from learner.errors import LearnerError
from learner.ranges.loader import DEFAULT_RANGE_DATA_DIR, load_ranges
from learner.sessions.memory import MemorySessionStore
from learner.sessions.service import SessionService
from learner.sessions.store import SessionStore

DEFAULT_CORS_ORIGINS = (
    "http://localhost:5173",
    "http://127.0.0.1:5173",
)


def _error_content(code: str, message: str, field: str | None = None) -> dict[str, Any]:
    error: dict[str, Any] = {"code": code, "message": message}
    if field is not None:
        error["field"] = field
    return {"error": error}


def _cors_origins() -> Sequence[str]:
    configured = os.getenv("LEARNER_CORS_ORIGINS")
    if configured is None:
        return DEFAULT_CORS_ORIGINS
    return tuple(origin.strip() for origin in configured.split(",") if origin.strip())


def create_app(
    range_data_dir: str | Path = DEFAULT_RANGE_DATA_DIR,
    session_store: SessionStore | None = None,
) -> FastAPI:
    """Create and configure a Poker Learner API application."""
    application = FastAPI(title="Poker Learner API", version=__version__)
    ranges = load_ranges(range_data_dir)
    drills = DrillRegistry(
        [
            RfiDrill(ranges),
            VsRfiDrill(ranges),
            BvbDrill(ranges),
            Vs3BetDrill(ranges),
        ]
    )
    store = MemorySessionStore() if session_store is None else session_store
    application.state.range_index = ranges
    application.state.drill_registry = drills
    application.state.session_service = SessionService(drills, store)
    application.add_middleware(
        CORSMiddleware,
        allow_origins=list(_cors_origins()),
        allow_credentials=False,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["*"],
    )

    @application.exception_handler(LearnerError)
    async def learner_error_handler(
        _request: Request, exc: LearnerError
    ) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content=_error_content(exc.code, exc.message, exc.field),
        )

    @application.exception_handler(RequestValidationError)
    async def validation_error_handler(
        _request: Request, exc: RequestValidationError
    ) -> JSONResponse:
        malformed_json = any(error["type"] == "json_invalid" for error in exc.errors())
        message = (
            "Request body is not valid JSON." if malformed_json else "Invalid request."
        )
        return JSONResponse(
            status_code=400,
            content=_error_content("invalid_request", message),
        )

    @application.exception_handler(StarletteHTTPException)
    async def http_error_handler(
        _request: Request, exc: StarletteHTTPException
    ) -> JSONResponse:
        if exc.status_code >= 500:
            return JSONResponse(
                status_code=500,
                content=_error_content("internal_error", "Unexpected server error."),
            )
        return JSONResponse(
            status_code=400,
            content=_error_content("invalid_request", str(exc.detail)),
        )

    @application.exception_handler(Exception)
    async def internal_error_handler(
        _request: Request, _exc: Exception
    ) -> JSONResponse:
        return JSONResponse(
            status_code=500,
            content=_error_content("internal_error", "Unexpected server error."),
        )

    application.include_router(v1_router)
    return application


app = create_app()
