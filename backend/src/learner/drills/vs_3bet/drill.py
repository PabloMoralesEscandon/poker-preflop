"""Facing-a-3-bet drill implementation."""

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
from learner.drills.positions import POSITION_LABELS, POSITION_ORDER
from learner.drills.range_grading import grade_range_action
from learner.drills.vs_3bet.models import (
    Vs3BetConfig,
    Vs3BetExplanation,
    Vs3BetHand,
    Vs3BetMistake,
    Vs3BetPrompt,
)
from learner.errors import LearnerError
from learner.ranges.loader import RangeIndex, load_ranges
from learner.ranges.models import (
    RangeData,
    cards_for_notation,
    combos,
    sampling_weight,
)

ACTION_ORDER = {"call": 0, "4bet": 1, "allin": 2}
BLIND_CONTRIBUTIONS = {"SB": 0.5, "BB": 1.0}


class Vs3BetDrill:
    """Generate, grade, and summarize facing-a-3-bet questions."""

    id = "vs_3bet"
    name = "Facing a 3-Bet"
    description = "Decide whether to fold, call, or 4-bet after your open is 3-bet."
    version = 1

    def __init__(self, ranges: RangeIndex | None = None) -> None:
        self.ranges = load_ranges() if ranges is None else ranges

    def config_schema(self) -> ConfigSchema:
        """Return configuration derived from the loaded matchup ranges."""
        options = self._matchup_options("8max")
        return ConfigSchema(
            fields=[
                EnumField(
                    key="table_format",
                    label="Table format",
                    type="enum",
                    default="8max",
                    options=[Option(value="8max", label="8-max full ring")],
                ),
                MultiEnumField(
                    key="matchups",
                    label="Matchups",
                    type="multi_enum",
                    default=[option.value for option in options],
                    depends_on="table_format",
                    options_by={"8max": options},
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
                            label="Uniform — any hand you opened",
                        ),
                        Option(
                            value="borderline",
                            label="Borderline — favour close decisions",
                        ),
                    ],
                ),
            ]
        )

    def validate_config(self, config: dict[str, Any]) -> Vs3BetConfig:
        """Validate raw facing-a-3-bet configuration."""
        values = validate_config_values(self.config_schema(), config)
        return Vs3BetConfig.model_validate(values)

    def generate(self, config: DrillConfig, index: int, rng: Random) -> Question:
        """Generate one reproducible question from configured matchups.

        Hands are drawn from the range's ``reach`` rather than from all 169.
        Hero opened to arrive here, so a hand hero never opens is not a hard
        question in this spot — it is not a question at all.
        """
        vs_config = _as_vs_3bet_config(config)
        matchup = rng.choice(vs_config.matchups)
        range_data = self._range(vs_config.table_format, matchup)
        hands = reachable_hands(range_data)
        weights = self._weights(vs_config, range_data, hands)
        notation = rng.choices(hands, weights=weights, k=1)[0]
        cards = cards_for_notation(notation, rng)

        return Question(
            question_id=f"q_{index}",
            index=index,
            total=vs_config.question_count,
            drill_id=self.id,
            prompt=Vs3BetPrompt(
                table_format=vs_config.table_format,
                hero_position=range_data.position,
                three_bettor_position=_villain(range_data),
                stack_bb=range_data.stack_bb,
                hand=Vs3BetHand(cards=list(cards), notation=notation),
                folded=folded_seats(range_data),
                open_size_bb=_open_size(range_data),
                facing_size_bb=_facing_size(range_data),
                pot_bb=pot_bb(range_data),
                to_call_bb=to_call_bb(range_data),
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
        vs_config = _as_vs_3bet_config(config)
        prompt = _prompt(question)
        range_data = self._range(vs_config.table_format, _matchup(prompt))
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
        vs_config = _as_vs_3bet_config(config)
        breakdown: list[BreakdownItem] = []
        mistakes: list[Vs3BetMistake] = []
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
                    label=_matchup_label(matchup),
                    answered=len(matchup_answers),
                    correct=correct,
                    accuracy=_accuracy(correct, len(matchup_answers)),
                )
            )

        for answer in answers:
            if answer.grade.correct:
                continue
            prompt = _prompt(answer.question)
            explanation = Vs3BetExplanation.model_validate(
                answer.grade.explanation.model_dump()
            )
            mistakes.append(
                Vs3BetMistake(
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
                label=_matchup_label(f"{item.position}_vs_{item.vs_position}"),
            )
            for item in self.ranges.list(spot="vs_3bet", table_format=table_format)
        ]

    def _range(self, table_format: str, matchup: str) -> RangeData:
        return self.ranges.get(f"vs_3bet_{table_format}_{matchup}")

    @staticmethod
    def _weights(
        config: Vs3BetConfig, range_data: RangeData, hands: list[str]
    ) -> list[int]:
        if config.weighting == "uniform":
            return [combos(hand) for hand in hands]
        return [sampling_weight(hand, range_data.grid) for hand in hands]


def reachable_hands(range_data: RangeData) -> list[str]:
    """Return the hands that arrive at this spot, in the file's own order."""
    assert range_data.reach is not None
    return list(range_data.reach)


def folded_seats(range_data: RangeData) -> list[str]:
    """Return every seat but hero and the 3-bettor.

    The chart is a heads-up pot: whoever was left to act behind the 3-bet has
    already folded by the time the decision returns to hero.
    """
    hero = range_data.position
    villain = _villain(range_data)
    return [
        seat
        for seat in POSITION_ORDER[range_data.table_format]
        if seat not in (hero, villain)
    ]


def pot_bb(range_data: RangeData) -> float:
    """Return the pot hero is deciding against, dead blinds included."""
    hero = range_data.position
    villain = _villain(range_data)
    dead = sum(
        amount
        for seat, amount in BLIND_CONTRIBUTIONS.items()
        if seat not in (hero, villain)
    )
    return round(_open_size(range_data) + _facing_size(range_data) + dead, 2)


def to_call_bb(range_data: RangeData) -> float:
    """Return what continuing costs hero, net of the open already committed."""
    return round(_facing_size(range_data) - _open_size(range_data), 2)


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
    if action == "4bet":
        return f"4-Bet to {size:g}bb"
    if action == "allin":
        return f"All-in {size:g}bb"
    return action.replace("_", " ").title()


def _villain(range_data: RangeData) -> str:
    assert range_data.vs_position is not None
    return range_data.vs_position


def _open_size(range_data: RangeData) -> float:
    assert range_data.hero_committed_bb is not None
    return range_data.hero_committed_bb


def _facing_size(range_data: RangeData) -> float:
    assert range_data.facing_size_bb is not None
    return range_data.facing_size_bb


def _as_vs_3bet_config(config: DrillConfig) -> Vs3BetConfig:
    if isinstance(config, Vs3BetConfig):
        return config
    return Vs3BetConfig.model_validate(config.model_dump())


def _prompt(question: Question) -> Vs3BetPrompt:
    return Vs3BetPrompt.model_validate(question.prompt.model_dump())


def _matchup(prompt: Vs3BetPrompt) -> str:
    return f"{prompt.hero_position}_vs_{prompt.three_bettor_position}"


def _matchup_label(matchup: str) -> str:
    hero, villain = matchup.split("_vs_", maxsplit=1)
    return f"{_seat(hero)} vs {_seat(villain)} 3-bet"


def _seat(position: str) -> str:
    return POSITION_LABELS[position].display


def _accuracy(correct: int, answered: int) -> float:
    return round(correct / answered, 4) if answered else 0.0


def _prose_action(action: str) -> str:
    if action == "4bet":
        return "4-bet"
    if action == "allin":
        return "all-in"
    return action


def _explanation(
    range_data: RangeData,
    prompt: Vs3BetPrompt,
    expected_id: str,
    frequencies: dict[str, float],
    mixed: bool,
) -> Vs3BetExplanation:
    notation = prompt.hand.notation
    hero = POSITION_LABELS[prompt.hero_position]
    villain = POSITION_LABELS[prompt.three_bettor_position]
    context = f"after opening from {hero.phrase} and being 3-bet by {villain.phrase}"
    if mixed:
        summary = f"{notation} is a mixed spot {context}."
    else:
        summary = f"{notation} is a pure {_prose_action(expected_id)} {context}."

    frequency_text = ", ".join(
        f"{_prose_action(action)} {frequency:.0%}"
        for action, frequency in frequencies.items()
        if frequency > 0.0
    )
    # Pot odds are the whole point of the call/fold half of this decision, so
    # state the price rather than leaving the learner to divide two numbers.
    equity_needed = prompt.to_call_bb / (prompt.pot_bb + prompt.to_call_bb)
    detail = (
        f"Hero opened to {prompt.open_size_bb:g}bb and faces a 3-bet to "
        f"{prompt.facing_size_bb:g}bb. Calling costs {prompt.to_call_bb:g}bb "
        f"into a {prompt.pot_bb:g}bb pot, so it needs {equity_needed:.0%} "
        f"equity to break even. The {hero.display} versus {villain.display} "
        f"3-bet chart assigns {frequency_text}."
    )
    return Vs3BetExplanation(
        summary=summary,
        detail=detail,
        range_id=range_data.range_id,
    )


drill = Vs3BetDrill()
