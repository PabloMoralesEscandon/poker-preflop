"""FastAPI application setup."""

import os
from collections.abc import Sequence
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from learner import __version__
from learner.api.v1 import router as v1_router

DEFAULT_CORS_ORIGINS = (
    "http://localhost:5173",
    "http://127.0.0.1:5173",
)


class LearnerError(Exception):
    """A client-safe error represented by the API's standard envelope."""

    def __init__(
        self,
        *,
        code: str,
        message: str,
        status_code: int,
        field: str | None = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code
        self.field = field


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


def create_app() -> FastAPI:
    """Create and configure a Poker Learner API application."""
    application = FastAPI(title="Poker Learner API", version=__version__)
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
        _request: Request, _exc: RequestValidationError
    ) -> JSONResponse:
        return JSONResponse(
            status_code=400,
            content=_error_content("invalid_request", "Invalid request."),
        )

    @application.exception_handler(StarletteHTTPException)
    async def http_error_handler(
        _request: Request, exc: StarletteHTTPException
    ) -> JSONResponse:
        if exc.status_code >= 500:
            return JSONResponse(
                status_code=500,
                content=_error_content("internal_error", "Internal server error."),
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
            content=_error_content("internal_error", "Internal server error."),
        )

    application.include_router(v1_router)
    return application


app = create_app()
