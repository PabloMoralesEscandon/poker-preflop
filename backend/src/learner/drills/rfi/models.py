"""Raise First In drill-specific models."""

from typing import Literal

from pydantic import BaseModel, ConfigDict

from learner.drills.base import DrillConfig, Explanation, Mistake, Prompt


class RfiConfig(DrillConfig):
    """Validated configuration for one RFI session."""

    table_format: Literal["6max", "9max"]
    positions: list[str]
    question_count: int
    weighting: Literal["uniform", "borderline"]


class RfiHand(BaseModel):
    """Concrete cards and their canonical 169-hand notation."""

    model_config = ConfigDict(extra="forbid")

    cards: list[str]
    notation: str


class RfiPrompt(Prompt):
    """Prompt payload rendered by the RFI frontend component."""

    model_config = ConfigDict(extra="forbid")

    kind: Literal["rfi"] = "rfi"
    table_format: Literal["6max", "9max"]
    hero_position: str
    stack_bb: float
    hand: RfiHand
    folded_before: list[str]
    pot_bb: float = 1.5


class RfiExplanation(Explanation):
    """An explanation tied directly to the range used for grading."""

    model_config = ConfigDict(extra="forbid")

    range_id: str


class RfiMistake(Mistake):
    """RFI-specific mistake categorisation."""

    model_config = ConfigDict(extra="forbid")

    position: str
    hand: str
    range_id: str
