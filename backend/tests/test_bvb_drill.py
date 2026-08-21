from random import Random

import pytest

from learner.drills.base import AnsweredQuestion, Question
from learner.drills.bvb import BvbDrill, actions_for_range
from learner.drills.bvb.models import BvbConfig, BvbHand, BvbPrompt
from learner.drills.range_grading import grade_range_action
from learner.drills.registry import registry
from learner.errors import LearnerError
from learner.main import create_app
from learner.ranges.loader import load_ranges
from learner.ranges.models import cards_for_notation


@pytest.fixture
def drill() -> BvbDrill:
    return BvbDrill(load_ranges())


def config_for(drill: BvbDrill, *situations: str, **overrides) -> BvbConfig:
    raw = {
        "situations": list(situations),
        "question_count": 5,
        "weighting": "borderline",
    }
    raw.update(overrides)
    return drill.validate_config(raw)


def question_for(
    drill: BvbDrill,
    config: BvbConfig,
    situation: str,
    notation: str,
    index: int,
) -> Question:
    range_id = (
        "vs_limp_6max_BB_vs_SB" if situation == "limp" else "vs_rfi_6max_BB_vs_SB"
    )
    range_data = drill.ranges.get(range_id)
    facing_size = range_data.facing_size_bb
    assert facing_size is not None
    return Question(
        question_id=f"q_{index}",
        index=index,
        total=config.question_count,
        drill_id="bvb",
        prompt=BvbPrompt(
            sb_action=situation,
            stack_bb=range_data.stack_bb,
            hand=BvbHand(
                cards=list(cards_for_notation(notation, Random(index))),
                notation=notation,
            ),
            facing_size_bb=facing_size,
            pot_bb=1.0 + facing_size,
            to_call_bb=max(0.0, facing_size - 1.0),
        ),
        actions=actions_for_range(range_data),
    )


def test_bvb_is_registered_at_both_composition_roots() -> None:
    assert registry.get("bvb").id == "bvb"
    assert create_app().state.drill_registry.get("bvb").id == "bvb"


def test_config_schema_offers_both_small_blind_actions(drill: BvbDrill) -> None:
    fields = drill.config_schema().fields

    assert [field.key for field in fields] == [
        "situations",
        "question_count",
        "weighting",
    ]
    assert [(option.value, option.label) for option in fields[0].options] == [
        ("limp", "Facing a limp"),
        ("raise", "Facing a raise"),
    ]
    assert drill.validate_config({}).model_dump() == {
        "situations": ["limp", "raise"],
        "question_count": 25,
        "weighting": "borderline",
    }


@pytest.mark.parametrize(
    ("raw", "field"),
    [
        ({"situations": []}, "situations"),
        ({"situations": ["fold"]}, "situations"),
        ({"question_count": 4}, "question_count"),
        ({"question_count": 201}, "question_count"),
        ({"weighting": "random"}, "weighting"),
    ],
)
def test_invalid_config_reports_the_offending_field(
    drill: BvbDrill, raw: dict, field: str
) -> None:
    with pytest.raises(LearnerError) as raised:
        drill.validate_config(raw)

    assert raised.value.code == "invalid_config"
    assert raised.value.field == field


@pytest.mark.parametrize(
    ("situation", "facing", "pot", "to_call", "actions"),
    [
        (
            "limp",
            1.0,
            2.0,
            0.0,
            [("check", "Check"), ("raise", "Raise to 3.5bb")],
        ),
        (
            "raise",
            3.0,
            4.0,
            2.0,
            [
                ("fold", "Fold"),
                ("call", "Call 3bb"),
                ("3bet", "3-Bet to 10.5bb"),
            ],
        ),
    ],
)
def test_generation_uses_situation_specific_arithmetic_and_actions(
    drill: BvbDrill,
    situation: str,
    facing: float,
    pot: float,
    to_call: float,
    actions: list[tuple[str, str]],
) -> None:
    config = config_for(drill, situation)
    first = drill.generate(config, 2, Random(19))
    second = drill.generate(config, 2, Random(19))
    prompt = BvbPrompt.model_validate(first.prompt.model_dump())

    assert first == second
    assert prompt.sb_action == situation
    assert prompt.facing_size_bb == facing
    assert prompt.pot_bb == pot
    assert prompt.to_call_bb == to_call
    assert [(action.id, action.label) for action in first.actions] == actions


@pytest.mark.parametrize(
    ("situation", "notation", "action_id"),
    [
        ("limp", "AA", "raise"),
        ("limp", "A7s", "check"),
        ("raise", "AA", "3bet"),
        ("raise", "72o", "fold"),
    ],
)
def test_grading_reuses_the_shared_range_rule(
    drill: BvbDrill, situation: str, notation: str, action_id: str
) -> None:
    config = config_for(drill, situation)
    question = question_for(drill, config, situation, notation, 1)
    grade = drill.grade(config, question, action_id)
    range_id = (
        "vs_limp_6max_BB_vs_SB" if situation == "limp" else "vs_rfi_6max_BB_vs_SB"
    )
    decision = grade_range_action(drill.ranges.get(range_id), notation, action_id)

    assert grade.correct == decision.correct
    assert grade.expected.action_id == decision.expected_id
    assert grade.explanation.range_id == range_id


def test_limp_question_rejects_fold_as_an_unoffered_action(drill: BvbDrill) -> None:
    config = config_for(drill, "limp")
    question = question_for(drill, config, "limp", "AA", 1)

    with pytest.raises(LearnerError, match="Unknown action id fold"):
        drill.grade(config, question, "fold")


def test_summary_groups_by_situation_and_records_mistakes(drill: BvbDrill) -> None:
    config = config_for(drill, "limp", "raise")
    questions_and_actions = [
        (question_for(drill, config, "limp", "AA", 1), "raise"),
        (question_for(drill, config, "raise", "72o", 2), "call"),
    ]
    answers = [
        AnsweredQuestion(
            question=question,
            action_id=action,
            grade=drill.grade(config, question, action),
        )
        for question, action in questions_and_actions
    ]

    summary = drill.summarize(config, answers)

    assert [(item.key, item.answered, item.correct) for item in summary.breakdown] == [
        ("limp", 1, 1),
        ("raise", 1, 0),
    ]
    assert summary.mistakes[0].model_dump() == {
        "question_id": "q_2",
        "chosen": "call",
        "expected": "fold",
        "situation": "raise",
        "hand": "72o",
        "range_id": "vs_rfi_6max_BB_vs_SB",
    }
