"""Request-scoped access to application services."""

from fastapi import Request

from learner.drills.registry import DrillRegistry
from learner.ranges.loader import RangeIndex
from learner.sessions.service import SessionService


def drill_registry(request: Request) -> DrillRegistry:
    return request.app.state.drill_registry


def range_index(request: Request) -> RangeIndex:
    return request.app.state.range_index


def session_service(request: Request) -> SessionService:
    return request.app.state.session_service
