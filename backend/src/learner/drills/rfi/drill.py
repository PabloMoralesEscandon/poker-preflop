"""Raise First In drill implementation."""

from __future__ import annotations

from dataclasses import dataclass
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
from learner.drills.rfi.models import (
    RfiConfig,
    RfiExplanation,
    RfiHand,
    RfiMistake,
    RfiPrompt,
)
from learner.errors import LearnerError
from learner.ranges.loader import RangeIndex, load_ranges
from learner.ranges.models import (
    RangeData,
    canonical_hands,
    cards_for_notation,
    combos,
    grid_coordinates,
    played_frequency,
    sampling_weight,
)

POSITION_ORDER = {
    "6max": ("UTG", "HJ", "CO", "BTN", "SB", "BB"),
    "8max": ("UTG", "UTG1", "LJ", "HJ", "CO", "BTN", "SB", "BB"),
}


@dataclass(frozen=True, slots=True)
class PositionLabel:
    """A display label with its sentence-level article behavior."""

    display: str
    article: str | None = "the"

    @property
    def phrase(self) -> str:
        return f"{self.article} {self.display}" if self.article else self.display


POSITION_LABELS = {
    "UTG": PositionLabel("UTG", article=None),
    "UTG1": PositionLabel("UTG+1", article=None),
    "LJ": PositionLabel("Lojack"),
    "HJ": PositionLabel("Hijack"),
    "CO": PositionLabel("Cutoff"),
    "BTN": PositionLabel("Button"),
    "SB": PositionLabel("Small blind"),
}

ACTION_ORDER = {"limp": 0, "raise": 1}


class RfiDrill:
    """Generate, grade, and summarize Raise First In questions."""

    id = "rfi"
    name = "Raise First In"
    description = "Decide whether to open-raise or fold when the pot is unopened."
    version = 1

    def __init__(self, ranges: RangeIndex | None = None) -> None:
        self.ranges = load_ranges() if ranges is None else ranges

    def config_schema(self) -> ConfigSchema:
        """Return the frozen v1 declarative configuration schema."""
        return ConfigSchema(
            fields=[
                EnumField(
                    key="table_format",
                    label="Table format",
                    type="enum",
                    default="6max",
                    options=[
                        Option(value="6max", label="6-max"),
                        Option(value="8max", label="8-max (full ring)"),
                    ],
                ),
                MultiEnumField(
                    key="positions",
                    label="Positions",
                    type="multi_enum",
                    default=["UTG", "HJ", "CO", "BTN", "SB"],
                    depends_on="table_format",
                    options_by={
                        "6max": _position_options(("UTG", "HJ", "CO", "BTN", "SB")),
                        "8max": _position_options(
                            (
                                "UTG",
                                "UTG1",
                                "LJ",
                                "HJ",
                                "CO",
                                "BTN",
                                "SB",
                            )
                        ),
                    },
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
                        Option(
                            value="uniform",
                            label="Uniform — any of the 169 hands",
                        ),
                        Option(
                            value="borderline",
                            label="Borderline — favour close decisions",
                        ),
                    ],
                ),
            ]
        )

    def validate_config(self, config: dict[str, Any]) -> RfiConfig:
        """Validate raw RFI configuration with field-specific domain errors."""
        values = validate_config_values(self.config_schema(), config)
        return RfiConfig.model_validate(values)

    def generate(self, config: DrillConfig, index: int, rng: Random) -> Question:
        """Generate one reproducible question from configured positions."""
        rfi_config = _as_rfi_config(config)
        position = rng.choice(rfi_config.positions)
        range_data = self._range(rfi_config.table_format, position)
        hands = canonical_hands()
        weights = self._weights(rfi_config, range_data)
        notation = rng.choices(hands, weights=weights, k=1)[0]
        cards = cards_for_notation(notation, rng)

        return Question(
            question_id=f"q_{index}",
            index=index,
            total=rfi_config.question_count,
            drill_id=self.id,
            prompt=RfiPrompt(
                table_format=rfi_config.table_format,
                hero_position=position,
                stack_bb=range_data.stack_bb,
                hand=RfiHand(cards=list(cards), notation=notation),
                folded_before=_folded_before(rfi_config.table_format, position),
                pot_bb=1.5,
            ),
            actions=actions_for_range(range_data),
        )

    def grade(
        self,
        config: DrillConfig,
        question: Question,
        action_id: str,
    ) -> Grade:
        """Grade one answer from the exact frequencies in its range cell."""
        rfi_config = _as_rfi_config(config)
        prompt = RfiPrompt.model_validate(question.prompt.model_dump())
        range_data = self._range(rfi_config.table_format, prompt.hero_position)
        labels = {action.id: action.label for action in question.actions}
        if action_id not in labels:
            raise LearnerError(
                code="invalid_request",
                message=f"Unknown action id {action_id}.",
                status_code=400,
            )

        cell = range_data.grid[prompt.hand.notation]
        frequencies = {action: cell.get(action, 0.0) for action in range_data.actions}
        frequencies["fold"] = max(0.0, 1.0 - played_frequency(cell))
        expected_id = max(
            [*range_data.actions, "fold"], key=lambda candidate: frequencies[candidate]
        )
        mixed = any(0.0 < frequency < 1.0 for frequency in frequencies.values())
        chosen_frequency = frequencies.get(action_id, 0.0)
        correct = chosen_frequency > 0.0

        return Grade(
            correct=correct,
            mixed=True if mixed else None,
            chosen=ChosenAction(action_id=action_id, label=labels[action_id]),
            expected=ExpectedAction(
                action_id=expected_id,
                label=labels[expected_id],
                frequency=frequencies[expected_id],
            ),
            explanation=_explanation(
                range_data,
                prompt.hand.notation,
                expected_id,
                frequencies,
                mixed,
            ),
        )

    def summarize(
        self,
        config: DrillConfig,
        answers: list[AnsweredQuestion],
    ) -> Summary:
        """Summarize accuracy by configured position and list mistakes."""
        rfi_config = _as_rfi_config(config)
        breakdown: list[BreakdownItem] = []
        mistakes: list[RfiMistake] = []
        for position in rfi_config.positions:
            position_answers = [
                answer
                for answer in answers
                if _prompt(answer.question).hero_position == position
            ]
            correct = sum(answer.grade.correct for answer in position_answers)
            breakdown.append(
                BreakdownItem(
                    key=position,
                    label=POSITION_LABELS[position].display,
                    answered=len(position_answers),
                    correct=correct,
                    accuracy=_accuracy(correct, len(position_answers)),
                )
            )

        for answer in answers:
            if answer.grade.correct:
                continue
            prompt = _prompt(answer.question)
            explanation = RfiExplanation.model_validate(
                answer.grade.explanation.model_dump()
            )
            mistakes.append(
                RfiMistake(
                    question_id=answer.question.question_id,
                    position=prompt.hero_position,
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
            complete=len(answers) >= rfi_config.question_count,
            breakdown=breakdown,
            mistakes=mistakes,
        )

    def _range(self, table_format: str, position: str) -> RangeData:
        return self.ranges.get(f"rfi_{table_format}_{position}")

    @staticmethod
    def _weights(config: RfiConfig, range_data: RangeData) -> list[int]:
        if config.weighting == "uniform":
            return [combos(hand) for hand in canonical_hands()]
        return [sampling_weight(hand, range_data.grid) for hand in canonical_hands()]


def actions_for_range(range_data: RangeData) -> list[Action]:
    """Build offered actions from range metadata, including fold."""
    non_fold = sorted(
        range_data.actions,
        key=lambda action: (ACTION_ORDER.get(action, 99), action),
    )
    return [Action(id="fold", label="Fold")] + [
        Action(id=action, label=_action_label(action, range_data))
        for action in non_fold
    ]


def _action_label(action: str, range_data: RangeData) -> str:
    if action == "raise":
        return f"Raise {range_data.action_sizes_bb[action]:g}bb"
    if action == "limp":
        return f"Limp {range_data.action_sizes_bb[action]:g}bb"
    return action.replace("_", " ").title()


def _position_options(positions: tuple[str, ...]) -> list[Option]:
    return [
        Option(value=position, label=POSITION_LABELS[position].display)
        for position in positions
    ]


def _as_rfi_config(config: DrillConfig) -> RfiConfig:
    if isinstance(config, RfiConfig):
        return config
    return RfiConfig.model_validate(config.model_dump())


def _folded_before(table_format: str, position: str) -> list[str]:
    order = POSITION_ORDER[table_format]
    return list(order[: order.index(position)])


def _prompt(question: Question) -> RfiPrompt:
    return RfiPrompt.model_validate(question.prompt.model_dump())


def _accuracy(correct: int, answered: int) -> float:
    return round(correct / answered, 4) if answered else 0.0


def _explanation(
    range_data: RangeData,
    notation: str,
    expected_id: str,
    frequencies: dict[str, float],
    mixed: bool,
) -> RfiExplanation:
    position = POSITION_LABELS[range_data.position]
    if mixed:
        summary = f"{notation} is a mixed spot from {position.phrase}."
    else:
        summary = f"{notation} is a pure {expected_id} from {position.phrase}."

    hand_class = (
        "pair"
        if len(notation) == 2
        else "suited hand"
        if notation.endswith("s")
        else "offsuit hand"
    )
    article = "an" if hand_class[0] in "aeiou" else "a"
    frequency_text = ", ".join(
        f"{action} {frequency:.0%}"
        for action, frequency in frequencies.items()
        if frequency > 0.0
    )
    neighbours = _adjacent_hands(notation)
    played_neighbours = sum(
        played_frequency(range_data.grid[hand]) > 0.0 for hand in neighbours
    )
    folded_neighbours = len(neighbours) - played_neighbours
    played_verb = "is" if played_neighbours == 1 else "are"
    fold_verb = "folds" if folded_neighbours == 1 else "fold"
    detail = (
        f"{notation} is {article} {hand_class}. "
        f"The {position.display} chart assigns "
        f"{frequency_text}. Of its {len(neighbours)} adjacent grid cells, "
        f"{played_neighbours} {played_verb} played and "
        f"{folded_neighbours} {fold_verb}."
    )
    return RfiExplanation(
        summary=summary,
        detail=detail,
        range_id=range_data.range_id,
    )


def _adjacent_hands(notation: str) -> list[str]:
    row, column = grid_coordinates(notation)
    return [
        hand
        for hand in canonical_hands()
        if hand != notation
        and max(
            abs(grid_coordinates(hand)[0] - row),
            abs(grid_coordinates(hand)[1] - column),
        )
        == 1
    ]


drill = RfiDrill()
