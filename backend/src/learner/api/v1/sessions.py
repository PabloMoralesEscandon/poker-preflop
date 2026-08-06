"""Session lifecycle endpoints."""

from typing import Annotated

from fastapi import APIRouter, Depends, status

from learner.api.v1.dependencies import session_service
from learner.api.v1.schemas import AnswerRequest, CreateSessionRequest
from learner.sessions.service import SessionService

router = APIRouter()
Service = Annotated[SessionService, Depends(session_service)]


@router.post("/sessions", status_code=status.HTTP_201_CREATED)
def create_session(
    request: CreateSessionRequest,
    service: Service,
) -> dict:
    session = service.create_session(
        drill_id=request.drill_id,
        config=request.config,
        seed=request.seed,
    )
    return {
        "session_id": session.session_id,
        "drill_id": session.drill_id,
        "config": session.config,
        "seed": session.seed,
        "created_at": session.created_at.isoformat().replace("+00:00", "Z"),
    }


@router.get("/sessions/{session_id}/next")
def next_question(
    session_id: str,
    service: Service,
) -> dict:
    question = service.next_question(session_id)
    return {
        "done": question is None,
        "question": (
            None
            if question is None
            else question.model_dump(mode="json", exclude_none=True)
        ),
    }


@router.post("/sessions/{session_id}/answer")
def answer_question(
    session_id: str,
    request: AnswerRequest,
    service: Service,
) -> dict:
    outcome = service.answer(session_id, request.question_id, request.action_id)
    payload = outcome.grade.model_dump(mode="json", exclude_none=True)
    payload["progress"] = {
        "answered": outcome.answered,
        "correct": outcome.correct,
        "total": outcome.total,
    }
    return payload


@router.get("/sessions/{session_id}/summary")
def session_summary(
    session_id: str,
    service: Service,
) -> dict:
    outcome = service.summary(session_id)
    return {
        "session_id": outcome.session_id,
        "drill_id": outcome.drill_id,
        **outcome.summary.model_dump(mode="json", exclude_none=True),
    }
