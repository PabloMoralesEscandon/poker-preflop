"""Raise First In drill implementation."""

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
from learner.drills.positions import POSITION_LABELS, folded_before
from learner.drills.range_grading import grade_range_action
from learner.drills.rfi.models import (
    RfiConfig,
    RfiExplanation,
    RfiHand,
    RfiMistake,
    RfiPrompt,
)
from learner.errors import LearnerError, invalid_config
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
from learner.ranges.plo import (
    PAIR_TIERS,
    plo_cards_for_class,
    plo_class_keys,
    plo_combos,
    plo_neighbors,
    plo_sampling_weight,
)

ACTION_ORDER = {"limp": 0, "raise": 1}

_PLO_TIER_NAMES = {
    "AA": "pair of aces",
    "KK": "pair of kings",
    "QQ": "pair of queens",
    "JJ": "pair of jacks",
    "TT": "pair of tens",
    "99-66": "medium pair",
    "55-22": "small pair",
}
_PLO_SHAPE_NAMES = {
    "0G": "zero-gap rundown",
    "1G": "one-gap rundown",
    "2G": "two-gap rundown",
    "A-KT": "ace with two broadway kickers",
    "A-96": "ace with two mid kickers",
    "A-52": "wheel-style ace",
    "OA": "unmatched ace-high hand",
    "Oth": "disconnected hand",
}
_PLO_TEXTURE_NAMES = {
    "ds": "double-suited",
    "ss": "single-suited",
    "r": "rainbow",
}


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
                    key="game",
                    label="Game",
                    type="enum",
                    default="holdem",
                    options=[
                        Option(value="holdem", label="Hold'em"),
                        Option(value="plo", label="PLO (Pot Limit Omaha)"),
                    ],
                ),
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
                            label="Uniform — any dealt hand",
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
        if values["game"] == "plo" and values["table_format"] == "8max":
            raise invalid_config(
                "PLO ranges are only available for 6-max tables.",
                "table_format",
            )
        return RfiConfig.model_validate(values)

    def generate(self, config: DrillConfig, index: int, rng: Random) -> Question:
        """Generate one reproducible question from configured positions."""
        rfi_config = _as_rfi_config(config)
        position = rng.choice(rfi_config.positions)
        range_data = self._range(rfi_config.game, rfi_config.table_format, position)

        if rfi_config.game == "plo":
            notation = rng.choices(
                plo_class_keys(),
                weights=self._plo_weights(rfi_config, range_data),
                k=1,
            )[0]
            cards: tuple[str, ...] | list[str] = plo_cards_for_class(notation, rng)
        else:
            hands = canonical_hands()
            weights = self._holdem_weights(rfi_config, range_data)
            notation = rng.choices(hands, weights=weights, k=1)[0]
            cards = cards_for_notation(notation, rng)

        return Question(
            question_id=f"q_{index}",
            index=index,
            total=rfi_config.question_count,
            drill_id=self.id,
            prompt=RfiPrompt(
                game=rfi_config.game,
                table_format=rfi_config.table_format,
                hero_position=position,
                stack_bb=range_data.stack_bb,
                hand=RfiHand(cards=list(cards), notation=notation),
                folded_before=folded_before(rfi_config.table_format, position),
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
        range_data = self._range(
            rfi_config.game, rfi_config.table_format, prompt.hero_position
        )
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
                prompt.hand.notation,
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

    def _range(self, game: str, table_format: str, position: str) -> RangeData:
        if game == "plo":
            return self.ranges.get(f"rfi_plo_{table_format}_{position}")
        return self.ranges.get(f"rfi_{table_format}_{position}")

    @staticmethod
    def _holdem_weights(config: RfiConfig, range_data: RangeData) -> list[int]:
        if config.weighting == "uniform":
            return [combos(hand) for hand in canonical_hands()]
        return [sampling_weight(hand, range_data.grid) for hand in canonical_hands()]

    @staticmethod
    def _plo_weights(config: RfiConfig, range_data: RangeData) -> list[int]:
        if config.weighting == "uniform":
            return [plo_combos(key) for key in plo_class_keys()]
        return [plo_sampling_weight(key, range_data.grid) for key in plo_class_keys()]


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
    frequency_text = ", ".join(
        f"{action} {frequency:.0%}"
        for action, frequency in frequencies.items()
        if frequency > 0.0
    )

    if range_data.game == "plo":
        description = _plo_class_description(notation)
        article = (
            "an"
            if description[0] in "aeiou" and not description.startswith("one")
            else "a"
        )
        neighbours = plo_neighbors(notation)
        played_neighbours = sum(
            played_frequency(range_data.grid[hand]) > 0.0 for hand in neighbours
        )
        folded_neighbours = len(neighbours) - played_neighbours
        played_verb = "is" if played_neighbours == 1 else "are"
        fold_verb = "folds" if folded_neighbours == 1 else "fold"
        detail = (
            f"{notation} is {article} {description}. "
            f"The {position.display} chart assigns "
            f"{frequency_text}. Of its {len(neighbours)} adjacent classes, "
            f"{played_neighbours} {played_verb} played and "
            f"{folded_neighbours} {fold_verb}."
        )
        return RfiExplanation(
            summary=summary,
            detail=detail,
            range_id=range_data.range_id,
        )

    hand_class = (
        "pair"
        if len(notation) == 2
        else "suited hand"
        if notation.endswith("s")
        else "offsuit hand"
    )
    article = "an" if hand_class[0] in "aeiou" else "a"
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


def _plo_class_description(key: str) -> str:
    if key == "Trips":
        return "three of a kind"
    if key == "Quads":
        return "four of a kind"
    shape, _, texture = key.partition(".")
    texture_name = _PLO_TEXTURE_NAMES[texture]
    if shape in PAIR_TIERS:
        return f"{texture_name} {_PLO_TIER_NAMES[shape]}"
    return f"{texture_name} {_PLO_SHAPE_NAMES[shape]}"


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
