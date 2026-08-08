"""Facing-an-RFI drill implementation."""

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
from learner.drills.vs_rfi.models import (
    VsRfiConfig,
    VsRfiExplanation,
    VsRfiHand,
    VsRfiMistake,
    VsRfiPrompt,
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

ACTION_ORDER = {"call": 0, "3bet": 1}
BLIND_CONTRIBUTIONS = {"SB": 0.5, "BB": 1.0}


class VsRfiDrill:
    """Generate, grade, and summarize facing-an-RFI questions."""

    id = "vs_rfi"
    name = "Facing an RFI"
    description = "Decide whether to fold, call, or 3-bet after an open-raise."
    version = 1

    def __init__(self, ranges: RangeIndex | None = None) -> None:
        self.ranges = load_ranges() if ranges is None else ranges

    def config_schema(self) -> ConfigSchema:
        """Return configuration derived from the loaded matchup ranges."""
        options = self._matchup_options("6max")
        return ConfigSchema(
            fields=[
                EnumField(
                    key="table_format",
                    label="Table format",
                    type="enum",
                    default="6max",
                    options=[Option(value="6max", label="6-max")],
                ),
                MultiEnumField(
                    key="matchups",
                    label="Matchups",
                    type="multi_enum",
                    default=[option.value for option in options],
                    depends_on="table_format",
                    options_by={"6max": options},
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

    def validate_config(self, config: dict[str, Any]) -> VsRfiConfig:
        """Validate raw facing-an-RFI configuration."""
        values = validate_config_values(self.config_schema(), config)
        return VsRfiConfig.model_validate(values)

    def generate(self, config: DrillConfig, index: int, rng: Random) -> Question:
        """Generate one reproducible question from configured matchups."""
        vs_config = _as_vs_rfi_config(config)
        matchup = rng.choice(vs_config.matchups)
        range_data = self._range(vs_config.table_format, matchup)
        hands = canonical_hands()
        weights = self._weights(vs_config, range_data)
        notation = rng.choices(hands, weights=weights, k=1)[0]
        cards = cards_for_notation(notation, rng)
        facing_size = range_data.facing_size_bb
        assert facing_size is not None
        pot_bb = 1.5 + facing_size
        to_call_bb = facing_size - BLIND_CONTRIBUTIONS.get(range_data.position, 0.0)

        return Question(
            question_id=f"q_{index}",
            index=index,
            total=vs_config.question_count,
            drill_id=self.id,
            prompt=VsRfiPrompt(
                table_format=vs_config.table_format,
                hero_position=range_data.position,
                raiser_position=range_data.vs_position,
                stack_bb=range_data.stack_bb,
                hand=VsRfiHand(cards=list(cards), notation=notation),
                folded_before=folded_before(
                    vs_config.table_format, range_data.vs_position
                ),
                facing_size_bb=facing_size,
                pot_bb=pot_bb,
                to_call_bb=to_call_bb,
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
        vs_config = _as_vs_rfi_config(config)
        prompt = VsRfiPrompt.model_validate(question.prompt.model_dump())
        matchup = f"{prompt.hero_position}_vs_{prompt.raiser_position}"
        range_data = self._range(vs_config.table_format, matchup)
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
        """Summarize accuracy by configured matchup and list mistakes."""
        vs_config = _as_vs_rfi_config(config)
        breakdown: list[BreakdownItem] = []
        mistakes: list[VsRfiMistake] = []
        for matchup in vs_config.matchups:
            matchup_answers = [
                answer
                for answer in answers
                if _matchup(_prompt(answer.question)) == matchup
            ]
            correct = sum(answer.grade.correct for answer in matchup_answers)
            breakdown.append(
                BreakdownItem(
                    key=matchup,
                    label=matchup.replace("_vs_", " vs "),
                    answered=len(matchup_answers),
                    correct=correct,
                    accuracy=_accuracy(correct, len(matchup_answers)),
                )
            )

        for answer in answers:
            if answer.grade.correct:
                continue
            prompt = _prompt(answer.question)
            explanation = VsRfiExplanation.model_validate(
                answer.grade.explanation.model_dump()
            )
            mistakes.append(
                VsRfiMistake(
                    question_id=answer.question.question_id,
                    matchup=_matchup(prompt),
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
            complete=len(answers) >= vs_config.question_count,
            breakdown=breakdown,
            mistakes=mistakes,
        )

    def _matchup_options(self, table_format: str) -> list[Option]:
        return [
            Option(
                value=f"{item.position}_vs_{item.vs_position}",
                label=f"{item.position} vs {item.vs_position}",
            )
            for item in self.ranges.list(spot="vs_rfi", table_format=table_format)
        ]

    def _range(self, table_format: str, matchup: str) -> RangeData:
        return self.ranges.get(f"vs_rfi_{table_format}_{matchup}")

    @staticmethod
    def _weights(config: VsRfiConfig, range_data: RangeData) -> list[int]:
        if config.weighting == "uniform":
            return [combos(hand) for hand in canonical_hands()]
        return [sampling_weight(hand, range_data.grid) for hand in canonical_hands()]


def actions_for_range(range_data: RangeData) -> list[Action]:
    """Build offered actions from matchup metadata, including fold."""
    non_fold = sorted(
        range_data.actions,
        key=lambda action: (ACTION_ORDER.get(action, 99), action),
    )
    return [Action(id="fold", label="Fold")] + [
        Action(id=action, label=_action_label(action, range_data))
        for action in non_fold
    ]


def _action_label(action: str, range_data: RangeData) -> str:
    size = range_data.action_sizes_bb[action]
    if action == "call":
        return f"Call {size:g}bb"
    if action == "3bet":
        return f"3-Bet to {size:g}bb"
    return action.replace("_", " ").title()


def _as_vs_rfi_config(config: DrillConfig) -> VsRfiConfig:
    if isinstance(config, VsRfiConfig):
        return config
    return VsRfiConfig.model_validate(config.model_dump())


def _prompt(question: Question) -> VsRfiPrompt:
    return VsRfiPrompt.model_validate(question.prompt.model_dump())


def _matchup(prompt: VsRfiPrompt) -> str:
    return f"{prompt.hero_position}_vs_{prompt.raiser_position}"


def _accuracy(correct: int, answered: int) -> float:
    return round(correct / answered, 4) if answered else 0.0


def _prose_action(action: str) -> str:
    return "3-bet" if action == "3bet" else action


def _explanation(
    range_data: RangeData,
    prompt: VsRfiPrompt,
    expected_id: str,
    frequencies: dict[str, float],
    mixed: bool,
) -> VsRfiExplanation:
    notation = prompt.hand.notation
    hero = POSITION_LABELS[prompt.hero_position]
    raiser = POSITION_LABELS[prompt.raiser_position]
    context = f"from {hero.phrase} against an open from {raiser.phrase}"
    if mixed:
        summary = f"{notation} is a mixed spot {context}."
    else:
        summary = f"{notation} is a pure {_prose_action(expected_id)} {context}."

    hand_class = (
        "pair"
        if len(notation) == 2
        else "suited hand"
        if notation.endswith("s")
        else "offsuit hand"
    )
    article = "an" if hand_class[0] in "aeiou" else "a"
    frequency_text = ", ".join(
        f"{_prose_action(action)} {frequency:.0%}"
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
        f"The {hero.display} versus {raiser.display} chart assigns "
        f"{frequency_text}. Facing {prompt.facing_size_bb:g}bb with "
        f"{prompt.pot_bb:g}bb in the pot, hero has {prompt.to_call_bb:g}bb "
        f"to call. Of its {len(neighbours)} adjacent grid cells, "
        f"{played_neighbours} {played_verb} played and "
        f"{folded_neighbours} {fold_verb}."
    )
    return VsRfiExplanation(
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


drill = VsRfiDrill()
