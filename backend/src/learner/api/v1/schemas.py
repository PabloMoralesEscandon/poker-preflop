"""HTTP request schemas for API v1."""

from typing import Any

from pydantic import BaseModel, ConfigDict


class CreateSessionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    drill_id: str
    config: dict[str, Any]
    seed: int | None = None


class AnswerRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    question_id: str
    action_id: str
