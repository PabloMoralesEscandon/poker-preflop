"""Blind-versus-blind drill-specific models."""

from typing import Literal

from pydantic import BaseModel, ConfigDict

from learner.drills.base import DrillConfig, Explanation, Mistake, Prompt


class BvbConfig(DrillConfig):
    """Validated configuration for one blind-versus-blind session."""

    situations: list[Literal["limp", "raise"]]
    question_count: int
    weighting: Literal["uniform", "borderline"]


class BvbHand(BaseModel):
    """Concrete cards and their canonical 169-hand notation."""

    model_config = ConfigDict(extra="forbid")

    cards: list[str]
    notation: str


class BvbPrompt(Prompt):
    """Prompt payload for a big-blind response to a small-blind action."""

    model_config = ConfigDict(extra="forbid")

    kind: Literal["bvb"] = "bvb"
    table_format: Literal["6max"] = "6max"
    hero_position: Literal["BB"] = "BB"
    vs_position: Literal["SB"] = "SB"
    sb_action: Literal["limp", "raise"]
    stack_bb: float
    hand: BvbHand
    facing_size_bb: float
    pot_bb: float
    to_call_bb: float


class BvbExplanation(Explanation):
    """An explanation tied directly to the range used for grading."""

    model_config = ConfigDict(extra="forbid")

    range_id: str


class BvbMistake(Mistake):
    """Blind-versus-blind mistake categorisation."""

    model_config = ConfigDict(extra="forbid")

    situation: Literal["limp", "raise"]
    hand: str
    range_id: str
