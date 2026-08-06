"""Drill-agnostic session workflow service."""

from __future__ import annotations

import secrets
from dataclasses import dataclass
from threading import RLock

from learner.drills.base import AnsweredQuestion, DrillConfig, Grade, Question, Summary
from learner.drills.registry import DrillRegistry
from learner.errors import LearnerError
from learner.sessions.store import Session, SessionStore


@dataclass(frozen=True, slots=True)
class AnswerOutcome:
    """A grade paired with session-wide progress."""

    grade: Grade
    answered: int
    correct: int
    total: int


@dataclass(frozen=True, slots=True)
class SummaryOutcome:
    """A drill summary paired with its session identity."""

    session_id: str
    drill_id: str
    summary: Summary


class SessionService:
    """Coordinate drills and persistence without HTTP concerns."""

    def __init__(self, drills: DrillRegistry, store: SessionStore) -> None:
        self.drills = drills
        self.store = store
        self._lock = RLock()

    def create_session(
        self,
        *,
        drill_id: str,
        config: dict,
        seed: int | None,
    ) -> Session:
        with self._lock:
            drill = self.drills.get(drill_id)
            validated = drill.validate_config(config)
            return self.store.create(
                drill_id=drill_id,
                config=validated.model_dump(),
                seed=secrets.randbits(63) if seed is None else seed,
            )

    def next_question(self, session_id: str) -> Question | None:
        """Return the current question, generating it exactly once when needed."""
        with self._lock:
            session = self.store.get(session_id)
            if session.current_question is not None:
                return session.current_question
            if _is_complete(session):
                return None

            drill = self.drills.get(session.drill_id)
            config = _validated_config(drill, session)
            session.current_question = drill.generate(
                config,
                len(session.answers) + 1,
                session.rng,
            )
            return session.current_question

    def answer(
        self, session_id: str, question_id: str, action_id: str
    ) -> AnswerOutcome:
        """Grade the current question and advance only after storing the answer."""
        with self._lock:
            session = self.store.get(session_id)
            if any(
                answered.question.question_id == question_id
                for answered in session.answers
            ):
                raise LearnerError(
                    code="question_already_answered",
                    message=f"{question_id} has already been answered.",
                    status_code=409,
                )

            current = session.current_question
            if current is None or current.question_id != question_id:
                raise LearnerError(
                    code="question_out_of_order",
                    message=f"{question_id} is not the current question.",
                    status_code=409,
                )

            drill = self.drills.get(session.drill_id)
            config = _validated_config(drill, session)
            grade = drill.grade(config, current, action_id)
            answered = AnsweredQuestion(
                question=current,
                action_id=action_id,
                grade=grade,
            )
            self.store.append_answer(session_id, answered)
            session.current_question = None
            return AnswerOutcome(
                grade=grade,
                answered=len(session.answers),
                correct=sum(item.grade.correct for item in session.answers),
                total=current.total,
            )

    def summary(self, session_id: str) -> SummaryOutcome:
        """Return the drill-defined summary for all answers currently stored."""
        with self._lock:
            session = self.store.get(session_id)
            drill = self.drills.get(session.drill_id)
            config = _validated_config(drill, session)
            return SummaryOutcome(
                session_id=session.session_id,
                drill_id=session.drill_id,
                summary=drill.summarize(config, session.answers),
            )


def _validated_config(drill, session: Session) -> DrillConfig:
    return drill.validate_config(session.config)


def _is_complete(session: Session) -> bool:
    if not session.answers:
        return False
    return len(session.answers) >= session.answers[-1].question.total
