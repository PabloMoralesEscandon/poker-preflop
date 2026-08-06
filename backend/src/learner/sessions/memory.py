"""In-memory session store implementation."""

from threading import RLock
from typing import Any
from uuid import uuid4

from learner.drills.base import AnsweredQuestion
from learner.errors import LearnerError
from learner.sessions.store import Session


class MemorySessionStore:
    """Process-local, thread-safe storage for session state."""

    def __init__(self) -> None:
        self._sessions: dict[str, Session] = {}
        self._lock = RLock()

    def create(
        self,
        *,
        drill_id: str,
        config: dict[str, Any],
        seed: int,
        session_id: str | None = None,
    ) -> Session:
        session = Session(
            session_id=session_id or f"s_{uuid4().hex}",
            drill_id=drill_id,
            config=dict(config),
            seed=seed,
        )
        with self._lock:
            if session.session_id in self._sessions:
                raise ValueError(f"Session id {session.session_id!r} already exists.")
            self._sessions[session.session_id] = session
        return session

    def get(self, session_id: str) -> Session:
        with self._lock:
            try:
                return self._sessions[session_id]
            except KeyError as exc:
                raise LearnerError(
                    code="session_not_found",
                    message="Unknown session id.",
                    status_code=404,
                ) from exc

    def append_answer(self, session_id: str, answer: AnsweredQuestion) -> Session:
        with self._lock:
            session = self.get(session_id)
            session.answers.append(answer)
            return session
