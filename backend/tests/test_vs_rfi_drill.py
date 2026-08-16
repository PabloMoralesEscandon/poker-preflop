import re
from random import Random

import pytest

from learner.drills.base import AnsweredQuestion, Question
from learner.drills.range_grading import grade_range_action
from learner.drills.registry import registry
from learner.drills.vs_rfi import VsRfiDrill, actions_for_range
from learner.drills.vs_rfi.models import (
    VsRfiConfig,
    VsRfiHand,
    VsRfiPrompt,
)
from learner.errors import LearnerError
from learner.main import create_app
from learner.ranges.loader import RangeIndex, load_ranges
from learner.ranges.models import RangeData, canonical_hands, cards_for_notation


@pytest.fixture
def drill() -> VsRfiDrill:
    return VsRfiDrill(load_ranges())


def config_for(
    drill: VsRfiDrill, *matchups: str, **overrides
) -> VsRfiConfig:
    raw = {
        "table_format": "6max",
        "matchups": list(matchups),
        "question_count": 5,
        "weighting": "borderline",
    }
    raw.update(overrides)
    return drill.validate_config(raw)


def question_for(
    drill: VsRfiDrill,
    config: VsRfiConfig,
    matchup: str,
    notation: str,
    index: int = 1,
) -> Question:
    range_data = drill.ranges.get(f"vs_rfi_{config.table_format}_{matchup}")
    hero, raiser = matchup.split("_vs_", maxsplit=1)
    facing_size = range_data.facing_size_bb
    assert facing_size is not None
    blind = {"SB": 0.5, "BB": 1.0}.get(hero, 0.0)
    return Question(
        question_id=f"q_{index}",
        index=index,
        total=config.question_count,
        drill_id="vs_rfi",
        prompt=VsRfiPrompt(
            table_format=config.table_format,
            hero_position=hero,
            raiser_position=raiser,
            stack_bb=range_data.stack_bb,
            hand=VsRfiHand(
                cards=list(cards_for_notation(notation, Random(index))),
                notation=notation,
            ),
            folded_before=[],
            facing_size_bb=facing_size,
            pot_bb=1.5 + facing_size,
            to_call_bb=facing_size - blind,
        ),
        actions=actions_for_range(range_data),
    )


def test_vs_rfi_is_registered_at_both_composition_roots() -> None:
    assert registry.get("vs_rfi").id == "vs_rfi"
    assert create_app().state.drill_registry.get("vs_rfi").id == "vs_rfi"


def test_config_schema_derives_matchups_from_loaded_ranges(drill: VsRfiDrill) -> None:
    field = drill.config_schema().fields[1]
    options = field.options_by["6max"]
    expected = [
        f"{item.position}_vs_{item.vs_position}"
        for item in drill.ranges.list(spot="vs_rfi", table_format="6max")
    ]

    assert [(option.value, option.label) for option in options] == [
        (matchup, matchup.replace("_vs_", " vs ")) for matchup in expected
    ]
    assert len(options) == 15
    assert ("BB_vs_SB", "BB vs SB") in [
        (option.value, option.label) for option in options
    ]
    assert field.default == expected


def test_config_defaults_match_the_schema(drill: VsRfiDrill) -> None:
    config = drill.validate_config({})

    assert config.table_format == "6max"
    assert config.matchups == [
        f"{item.position}_vs_{item.vs_position}"
        for item in drill.ranges.list(spot="vs_rfi", table_format="6max")
    ]
    assert config.question_count == 25
    assert config.weighting == "borderline"


@pytest.mark.parametrize(
    ("raw", "field"),
    [
        ({"table_format": "8max"}, "table_format"),
        ({"matchups": []}, "matchups"),
        ({"matchups": ["BB_vs_BB"]}, "matchups"),
        ({"question_count": 4}, "question_count"),
        ({"question_count": 201}, "question_count"),
    ],
)
def test_invalid_config_reports_the_offending_field(
    drill: VsRfiDrill, raw: dict, field: str
) -> None:
    with pytest.raises(LearnerError) as raised:
        drill.validate_config(raw)

    assert raised.value.code == "invalid_config"
    assert raised.value.field == field


def test_generation_is_deterministic_for_a_fixed_seed(drill: VsRfiDrill) -> None:
    config = config_for(drill, "BTN_vs_CO", "BB_vs_BTN")

    first = drill.generate(config, 3, Random(12345))
    second = drill.generate(config, 3, Random(12345))

    assert first == second
    assert first.question_id == "q_3"
    assert first.index == 3
    assert first.total == 5


def test_generation_uses_only_configured_matchups(drill: VsRfiDrill) -> None:
    config = config_for(drill, "HJ_vs_UTG", "BB_vs_BTN")
    rng = Random(91)

    generated = [drill.generate(config, index, rng) for index in range(1, 101)]
    matchups = {
        f"{prompt.hero_position}_vs_{prompt.raiser_position}"
        for question in generated
        for prompt in [VsRfiPrompt.model_validate(question.prompt.model_dump())]
    }

    assert matchups <= {"HJ_vs_UTG", "BB_vs_BTN"}
    assert matchups == {"HJ_vs_UTG", "BB_vs_BTN"}


@pytest.mark.parametrize(
    ("matchup", "folds", "pot_bb", "to_call_bb"),
    [
        ("HJ_vs_UTG", [], 4.0, 2.5),
        ("BTN_vs_CO", ["UTG", "HJ"], 4.0, 2.5),
        ("SB_vs_BTN", ["UTG", "HJ", "CO"], 4.0, 2.0),
        ("BB_vs_BTN", ["UTG", "HJ", "CO"], 4.0, 1.5),
    ],
)
def test_prompt_poker_arithmetic_matches_hand_calculation(
    drill: VsRfiDrill,
    matchup: str,
    folds: list[str],
    pot_bb: float,
    to_call_bb: float,
) -> None:
    question = drill.generate(config_for(drill, matchup), 1, Random(1))
    prompt = VsRfiPrompt.model_validate(question.prompt.model_dump())

    assert prompt.folded_before == folds
    assert prompt.facing_size_bb == 2.5
    assert prompt.pot_bb == pot_bb
    assert prompt.to_call_bb == to_call_bb


def test_actions_cover_two_and_three_button_matchups(drill: VsRfiDrill) -> None:
    two = drill.generate(config_for(drill, "HJ_vs_UTG"), 1, Random(1))
    three = drill.generate(config_for(drill, "BB_vs_BTN"), 1, Random(1))

    assert [(action.id, action.label) for action in two.actions] == [
        ("fold", "Fold"),
        ("3bet", "3-Bet to 8.75bb"),
    ]
    assert [(action.id, action.label) for action in three.actions] == [
        ("fold", "Fold"),
        ("call", "Call 2.5bb"),
        ("3bet", "3-Bet to 10bb"),
    ]


def test_grading_reuses_the_shared_range_rule(drill: VsRfiDrill) -> None:
    config = config_for(drill, "BB_vs_BTN")
    for notation, action_id in (("AA", "3bet"), ("98s", "call"), ("72o", "fold")):
        question = question_for(drill, config, "BB_vs_BTN", notation)
        grade = drill.grade(config, question, action_id)
        decision = grade_range_action(
            drill.ranges.get("vs_rfi_6max_BB_vs_BTN"), notation, action_id
        )

        assert grade.correct == decision.correct
        assert grade.mixed == (True if decision.mixed else None)
        assert grade.expected.action_id == decision.expected_id
        assert grade.expected.frequency == decision.frequencies[decision.expected_id]


def test_mixed_hand_accepts_every_positive_frequency_action(
    matchup_range_payload,
) -> None:
    payload = matchup_range_payload()
    payload["grid"]["KQs"] = {"3bet": 0.25, "call": 0.5}
    range_data = RangeData.model_validate(payload)
    mixed_drill = VsRfiDrill(RangeIndex([range_data]))
    config = config_for(mixed_drill, "BB_vs_BTN")
    question = question_for(mixed_drill, config, "BB_vs_BTN", "KQs")

    grades = {
        action: mixed_drill.grade(config, question, action)
        for action in ("3bet", "call", "fold")
    }

    assert all(grade.correct is True for grade in grades.values())
    assert all(grade.mixed is True for grade in grades.values())
    assert grades["call"].expected.action_id == "call"
    assert grades["call"].expected.frequency == 0.5


def test_summary_groups_by_matchup_and_records_mistakes(drill: VsRfiDrill) -> None:
    config = config_for(drill, "HJ_vs_UTG", "BB_vs_BTN")
    questions_and_actions = [
        (question_for(drill, config, "HJ_vs_UTG", "AA", 1), "3bet"),
        (question_for(drill, config, "BB_vs_BTN", "72o", 2), "call"),
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

    assert [item.model_dump() for item in summary.breakdown] == [
        {
            "key": "HJ_vs_UTG",
            "label": "HJ vs UTG",
            "answered": 1,
            "correct": 1,
            "accuracy": 1.0,
        },
        {
            "key": "BB_vs_BTN",
            "label": "BB vs BTN",
            "answered": 1,
            "correct": 0,
            "accuracy": 0.0,
        },
    ]
    assert summary.mistakes[0].model_dump() == {
        "question_id": "q_2",
        "chosen": "call",
        "expected": "fold",
        "matchup": "BB_vs_BTN",
        "hand": "72o",
        "range_id": "vs_rfi_6max_BB_vs_BTN",
    }


def test_all_shipped_explanations_pass_grammar_sweep(drill: VsRfiDrill) -> None:
    lowercase_sentence_start = re.compile(r"(?:^|[.!?]\s+)[a-z]")

    for range_data in drill.ranges.list(spot="vs_rfi"):
        matchup = f"{range_data.position}_vs_{range_data.vs_position}"
        config = config_for(drill, matchup)
        for notation in canonical_hands():
            question = question_for(drill, config, matchup, notation)
            grade = drill.grade(config, question, "fold")
            for copy in (grade.explanation.summary, grade.explanation.detail):
                lowered = copy.lower()
                assert "  " not in copy
                assert lowercase_sentence_start.search(copy) is None
                assert not any(f" a {vowel}" in lowered for vowel in "aeiou")
                assert re.search(r"\b1 are\b", copy) is None
                assert re.search(r"vs_rfi_6max_[A-Z]+_vs_[A-Z]+", copy) is None
                assert "the UTG" not in copy
                assert "the UTG+1" not in copy
