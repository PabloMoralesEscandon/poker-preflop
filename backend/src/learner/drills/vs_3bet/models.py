"""Facing-a-3-bet drill-specific models."""

from typing import Literal

from pydantic import BaseModel, ConfigDict

from learner.drills.base import DrillConfig, Explanation, Mistake, Prompt


class Vs3BetConfig(DrillConfig):
    """Validated configuration for one facing-a-3-bet session."""

    table_format: Literal["8max"]
    matchups: list[str]
    question_count: int
    weighting: Literal["uniform", "borderline"]


class Vs3BetHand(BaseModel):
    """Concrete cards and their canonical 169-hand notation."""

    model_config = ConfigDict(extra="forbid")

    cards: list[str]
    notation: str


class Vs3BetPrompt(Prompt):
    """Prompt payload rendered by the facing-a-3-bet frontend component.

    Unlike every earlier prompt, hero is not entering the pot: they opened it.
    ``open_size_bb`` is what they already have in, which is why ``to_call_bb``
    is smaller than the 3-bet they face, and why ``folded`` names every seat but
    two — the pot is heads-up by the time the decision comes back around.
    """

    model_config = ConfigDict(extra="forbid")

    kind: Literal["vs_3bet"] = "vs_3bet"
    table_format: Literal["8max"]
    hero_position: str
    three_bettor_position: str
    stack_bb: float
    hand: Vs3BetHand
    folded: list[str]
    open_size_bb: float
    facing_size_bb: float
    pot_bb: float
    to_call_bb: float


class Vs3BetExplanation(Explanation):
    """An explanation tied directly to the matchup range used for grading."""

    model_config = ConfigDict(extra="forbid")

    range_id: str


class Vs3BetMistake(Mistake):
    """Facing-a-3-bet-specific mistake categorisation."""

    model_config = ConfigDict(extra="forbid")

    matchup: str
    hand: str
    range_id: str
