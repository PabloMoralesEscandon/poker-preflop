"""Facing-an-RFI drill-specific models."""

from typing import Literal

from pydantic import BaseModel, ConfigDict

from learner.drills.base import DrillConfig, Explanation, Mistake, Prompt


class VsRfiConfig(DrillConfig):
    """Validated configuration for one facing-an-RFI session."""

    table_format: Literal["6max"]
    matchups: list[str]
    question_count: int
    weighting: Literal["uniform", "borderline"]


class VsRfiHand(BaseModel):
    """Concrete cards and their canonical 169-hand notation."""

    model_config = ConfigDict(extra="forbid")

    cards: list[str]
    notation: str


class VsRfiPrompt(Prompt):
    """Prompt payload rendered by the facing-an-RFI frontend component."""

    model_config = ConfigDict(extra="forbid")

    kind: Literal["vs_rfi"] = "vs_rfi"
    table_format: Literal["6max"]
    hero_position: str
    raiser_position: str
    stack_bb: float
    hand: VsRfiHand
    folded_before: list[str]
    facing_size_bb: float
    pot_bb: float
    to_call_bb: float


class VsRfiExplanation(Explanation):
    """An explanation tied directly to the matchup range used for grading."""

    model_config = ConfigDict(extra="forbid")

    range_id: str


class VsRfiMistake(Mistake):
    """Facing-an-RFI-specific mistake categorisation."""

    model_config = ConfigDict(extra="forbid")

    matchup: str
    hand: str
    range_id: str
