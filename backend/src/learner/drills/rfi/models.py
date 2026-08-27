"""Raise First In drill-specific models."""

from typing import Literal

from pydantic import BaseModel, ConfigDict

from learner.drills.base import DrillConfig, Explanation, Mistake, Prompt
from learner.ranges.models import Game


class RfiConfig(DrillConfig):
    """Validated configuration for one RFI session."""

    game: Game = "holdem"
    table_format: Literal["6max", "8max"]
    positions: list[str]
    question_count: int
    weighting: Literal["uniform", "borderline"]


class RfiHand(BaseModel):
    """Concrete cards and their canonical notation.

    Hold'em notations are the 169-hand shorthand; PLO notations are the
    47 class keys from ``learner.ranges.plo``.
    """

    model_config = ConfigDict(extra="forbid")

    cards: list[str]
    notation: str


class RfiPrompt(Prompt):
    """Prompt payload rendered by the RFI frontend component."""

    model_config = ConfigDict(extra="forbid")

    kind: Literal["rfi"] = "rfi"
    game: Game = "holdem"
    table_format: Literal["6max", "8max"]
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
