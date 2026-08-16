"""Blind-versus-blind drill implementation."""

from __future__ import annotations

from random import Random
from typing import Any

from learner.drills.base import (
    Action,
    AnsweredQuestion,
    BreakdownItem,
    ChosenAction,
    ConfigSchema,
    DrillConfig,
    EnumField,
    ExpectedAction,
    Grade,
    IntField,
    MultiEnumField,
    Option,
    Question,
    Summary,
    validate_config_values,
)
from learner.drills.bvb.models import (
    BvbConfig,
    BvbExplanation,
    BvbHand,
    BvbMistake,
    BvbPrompt,
)
from learner.drills.range_grading import grade_range_action
from learner.errors import LearnerError
from learner.ranges.loader import RangeIndex, load_ranges
from learner.ranges.models import (
    RangeData,
    canonical_hands,
    cards_for_notation,
    combos,
    sampling_weight,
)

SITUATIONS = ("limp", "raise")
SITUATION_LABELS = {"limp": "Facing a limp", "raise": "Facing a raise"}
RANGE_IDS = {
    "limp": "vs_limp_6max_BB_vs_SB",
    "raise": "vs_rfi_6max_BB_vs_SB",
}
ACTION_ORDER = {"check": 0, "call": 0, "raise": 1, "3bet": 1}


class BvbDrill:
    """Generate, grade, and summarize blind-versus-blind questions."""

    id = "bvb"
    name = "Blind vs Blind"
    description = "Respond from the big blind when the small blind limps or raises."
    version = 1

    def __init__(self, ranges: RangeIndex | None = None) -> None:
        self.ranges = load_ranges() if ranges is None else ranges

    def config_schema(self) -> ConfigSchema:
        """Return the two-situation blind-versus-blind configuration."""
        return ConfigSchema(
            fields=[
                MultiEnumField(
                    key="situations",
                    label="Situations",
                    type="multi_enum",
                    default=list(SITUATIONS),
                    options=[
                        Option(value=situation, label=SITUATION_LABELS[situation])
                        for situation in SITUATIONS
                    ],
                ),
                IntField(
                    key="question_count",
                    label="Hands",
                    type="int",
                    default=25,
                    min=5,
                    max=200,
                ),
                EnumField(
                    key="weighting",
                    label="Hand selection",
                    type="enum",
                    default="borderline",
                    options=[
                        Option(value="uniform", label="Uniform — any of the 169 hands"),
                        Option(
                            value="borderline",
                            label="Borderline — favour close decisions",
                        ),
                    ],
                ),
            ]
        )

    def validate_config(self, config: dict[str, Any]) -> BvbConfig:
        """Validate raw blind-versus-blind configuration."""
        values = validate_config_values(self.config_schema(), config)
        return BvbConfig.model_validate(values)

    def generate(self, config: DrillConfig, index: int, rng: Random) -> Question:
        """Generate one reproducible question from the selected situations."""
        bvb_config = _as_bvb_config(config)
        situation = rng.choice(bvb_config.situations)
        range_data = self._range(situation)
        hands = canonical_hands()
        weights = self._weights(bvb_config, range_data)
        notation = rng.choices(hands, weights=weights, k=1)[0]
        cards = cards_for_notation(notation, rng)
        facing_size = range_data.facing_size_bb
        assert facing_size is not None

        return Question(
            question_id=f"q_{index}",
            index=index,
            total=bvb_config.question_count,
            drill_id=self.id,
            prompt=BvbPrompt(
                sb_action=situation,
                stack_bb=range_data.stack_bb,
                hand=BvbHand(cards=list(cards), notation=notation),
                facing_size_bb=facing_size,
                pot_bb=1.0 + facing_size,
                to_call_bb=max(0.0, facing_size - 1.0),
            ),
            actions=actions_for_range(range_data),
        )

    def grade(
        self,
        config: DrillConfig,
        question: Question,
        action_id: str,
    ) -> Grade:
        """Grade with the shared positive-frequency range rule."""
        _as_bvb_config(config)
        prompt = BvbPrompt.model_validate(question.prompt.model_dump())
        range_data = self._range(prompt.sb_action)
        labels = {action.id: action.label for action in question.actions}
        if action_id not in labels:
            raise LearnerError(
                code="invalid_request",
                message=f"Unknown action id {action_id}.",
                status_code=400,
            )

        decision = grade_range_action(range_data, prompt.hand.notation, action_id)
        return Grade(
            correct=decision.correct,
            mixed=True if decision.mixed else None,
            chosen=ChosenAction(action_id=action_id, label=labels[action_id]),
            expected=ExpectedAction(
                action_id=decision.expected_id,
                label=labels[decision.expected_id],
                frequency=decision.frequencies[decision.expected_id],
            ),
            explanation=_explanation(
                range_data,
                prompt,
                decision.expected_id,
                decision.frequencies,
                decision.mixed,
            ),
        )

    def summarize(
        self,
        config: DrillConfig,
        answers: list[AnsweredQuestion],
    ) -> Summary:
        """Summarize accuracy by small-blind action and list mistakes."""
        bvb_config = _as_bvb_config(config)
        breakdown: list[BreakdownItem] = []
        mistakes: list[BvbMistake] = []
        for situation in bvb_config.situations:
            situation_answers = [
                answer
                for answer in answers
                if _prompt(answer.question).sb_action == situation
            ]
            correct = sum(answer.grade.correct for answer in situation_answers)
            breakdown.append(
                BreakdownItem(
                    key=situation,
                    label=SITUATION_LABELS[situation],
                    answered=len(situation_answers),
                    correct=correct,
                    accuracy=_accuracy(correct, len(situation_answers)),
                )
            )

        for answer in answers:
            if answer.grade.correct:
                continue
            prompt = _prompt(answer.question)
            explanation = BvbExplanation.model_validate(
                answer.grade.explanation.model_dump()
            )
            mistakes.append(
                BvbMistake(
                    question_id=answer.question.question_id,
                    situation=prompt.sb_action,
                    hand=prompt.hand.notation,
                    chosen=answer.grade.chosen.action_id,
                    expected=answer.grade.expected.action_id,
                    range_id=explanation.range_id,
                )
            )

        correct = sum(answer.grade.correct for answer in answers)
        return Summary(
            answered=len(answers),
            correct=correct,
            accuracy=_accuracy(correct, len(answers)),
            complete=len(answers) >= bvb_config.question_count,
            breakdown=breakdown,
            mistakes=mistakes,
        )

    def _range(self, situation: str) -> RangeData:
        return self.ranges.get(RANGE_IDS[situation])

    @staticmethod
    def _weights(config: BvbConfig, range_data: RangeData) -> list[int]:
        if config.weighting == "uniform":
            return [combos(hand) for hand in canonical_hands()]
        return [sampling_weight(hand, range_data.grid) for hand in canonical_hands()]


def actions_for_range(range_data: RangeData) -> list[Action]:
    """Build the legal actions from range metadata, adding fold only vs an RFI."""
    actions = sorted(
        range_data.actions,
        key=lambda action: (ACTION_ORDER.get(action, 99), action),
    )
    offered = [
        Action(id=action, label=_action_label(action, range_data))
        for action in actions
    ]
    if range_data.spot == "vs_rfi":
        return [Action(id="fold", label="Fold"), *offered]
    return offered


def _action_label(action: str, range_data: RangeData) -> str:
    size = range_data.action_sizes_bb[action]
    if action == "check":
        return "Check"
    if action == "raise":
        return f"Raise to {size:g}bb"
    if action == "call":
        return f"Call {size:g}bb"
    if action == "3bet":
        return f"3-Bet to {size:g}bb"
    return action.replace("_", " ").title()


def _as_bvb_config(config: DrillConfig) -> BvbConfig:
    if isinstance(config, BvbConfig):
        return config
    return BvbConfig.model_validate(config.model_dump())


def _prompt(question: Question) -> BvbPrompt:
    return BvbPrompt.model_validate(question.prompt.model_dump())


def _accuracy(correct: int, answered: int) -> float:
    return round(correct / answered, 4) if answered else 0.0


def _prose_action(action: str) -> str:
    return "3-bet" if action == "3bet" else action


def _explanation(
    range_data: RangeData,
    prompt: BvbPrompt,
    expected_id: str,
    frequencies: dict[str, float],
    mixed: bool,
) -> BvbExplanation:
    notation = prompt.hand.notation
    context = f"in the big blind against a small-blind {prompt.sb_action}"
    if mixed:
        summary = f"{notation} is a mixed spot {context}."
    else:
        summary = f"{notation} is a pure {_prose_action(expected_id)} {context}."

    frequency_text = ", ".join(
        f"{_prose_action(action)} {frequency:.0%}"
        for action, frequency in frequencies.items()
        if frequency > 0.0
    )
    detail = (
        f"The big blind versus small blind {prompt.sb_action} chart assigns "
        f"{notation} {frequency_text}. Facing {prompt.facing_size_bb:g}bb with "
        f"{prompt.pot_bb:g}bb in the pot, hero has {prompt.to_call_bb:g}bb to call."
    )
    return BvbExplanation(
        summary=summary,
        detail=detail,
        range_id=range_data.range_id,
    )


drill = BvbDrill()
