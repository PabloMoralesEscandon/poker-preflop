import json
import re
from pathlib import Path
from random import Random

import pytest

from learner.drills.base import AnsweredQuestion, Question
from learner.drills.registry import registry
from learner.drills.rfi import RfiDrill, actions_for_range
from learner.drills.rfi.models import RfiConfig, RfiHand, RfiPrompt
from learner.errors import LearnerError
from learner.ranges.loader import RangeIndex, load_ranges
from learner.ranges.models import RangeData, canonical_hands, cards_for_notation


@pytest.fixture
def drill() -> RfiDrill:
    return RfiDrill(load_ranges())


def config_for(drill: RfiDrill, *positions: str, **overrides) -> RfiConfig:
    raw = {
        "table_format": "6max",
        "positions": list(positions),
        "question_count": 5,
        "weighting": "borderline",
    }
    raw.update(overrides)
    return drill.validate_config(raw)


def question_for(
    drill: RfiDrill, config: RfiConfig, position: str, notation: str, index: int = 1
) -> Question:
    range_data = drill.ranges.get(f"rfi_{config.table_format}_{position}")
    return Question(
        question_id=f"q_{index}",
        index=index,
        total=config.question_count,
        drill_id="rfi",
        prompt=RfiPrompt(
            table_format=config.table_format,
            hero_position=position,
            stack_bb=range_data.stack_bb,
            hand=RfiHand(
                cards=list(cards_for_notation(notation, Random(index))),
                notation=notation,
            ),
            folded_before=[],
            pot_bb=1.5,
        ),
        actions=actions_for_range(range_data),
    )


def test_rfi_is_registered() -> None:
    assert registry.get("rfi").id == "rfi"


def test_config_schema_matches_the_canonical_fixture_exactly(drill: RfiDrill) -> None:
    fixture_path = Path(__file__).resolve().parents[2] / "docs/examples/drills.json"
    fixture = json.loads(fixture_path.read_text(encoding="utf-8"))["drills"][0]

    assert {
        "id": drill.id,
        "name": drill.name,
        "description": drill.description,
        "version": drill.version,
        "config_schema": drill.config_schema().model_dump(exclude_none=True),
    } == fixture


def test_config_defaults_match_the_schema(drill: RfiDrill) -> None:
    config = drill.validate_config({})

    assert config == RfiConfig(
        table_format="6max",
        positions=["UTG", "HJ", "CO", "BTN", "SB"],
        question_count=25,
        weighting="borderline",
    )


@pytest.mark.parametrize(
    ("raw", "field"),
    [
        ({"positions": []}, "positions"),
        ({"positions": ["BB"]}, "positions"),
        ({"table_format": "6max", "positions": ["UTG1"]}, "positions"),
        ({"question_count": 4}, "question_count"),
        ({"question_count": 201}, "question_count"),
    ],
)
def test_invalid_config_reports_the_offending_field(
    drill: RfiDrill, raw: dict, field: str
) -> None:
    with pytest.raises(LearnerError) as raised:
        drill.validate_config(raw)

    assert raised.value.code == "invalid_config"
    assert raised.value.field == field


def test_generation_is_deterministic_for_a_fixed_seed(drill: RfiDrill) -> None:
    config = config_for(drill, "HJ", "CO", "BTN")

    first = drill.generate(config, 3, Random(12345))
    second = drill.generate(config, 3, Random(12345))

    assert first == second
    assert first.question_id == "q_3"
    assert first.index == 3
    assert first.total == 5


def test_generation_uses_only_configured_positions(drill: RfiDrill) -> None:
    config = config_for(drill, "HJ", "SB")
    rng = Random(91)

    generated = [drill.generate(config, index, rng) for index in range(1, 101)]

    assert {
        RfiPrompt.model_validate(question.prompt.model_dump()).hero_position
        for question in generated
    } <= {"HJ", "SB"}


@pytest.mark.parametrize(
    ("position", "folded_before"),
    [
        ("UTG", []),
        ("HJ", ["UTG"]),
        ("CO", ["UTG", "HJ"]),
        ("BTN", ["UTG", "HJ", "CO"]),
        ("SB", ["UTG", "HJ", "CO", "BTN"]),
    ],
)
def test_folded_before_comes_from_table_order(
    drill: RfiDrill, position: str, folded_before: list[str]
) -> None:
    question = drill.generate(config_for(drill, position), 1, Random(1))
    prompt = RfiPrompt.model_validate(question.prompt.model_dump())

    assert prompt.folded_before == folded_before


def test_actions_are_derived_from_each_ranges_data(drill: RfiDrill) -> None:
    co = drill.generate(config_for(drill, "CO"), 1, Random(1))
    sb = drill.generate(config_for(drill, "SB"), 1, Random(1))

    assert [(action.id, action.label) for action in co.actions] == [
        ("fold", "Fold"),
        ("raise", "Raise 2.5bb"),
    ]
    assert [(action.id, action.label) for action in sb.actions] == [
        ("fold", "Fold"),
        ("limp", "Limp 1bb"),
        ("raise", "Raise 3bb"),
    ]


def test_grading_pure_raise_and_fold_hands(drill: RfiDrill) -> None:
    config = config_for(drill, "CO")
    pure_raise = question_for(drill, config, "CO", "AA")
    pure_fold = question_for(drill, config, "CO", "72o")

    raise_grade = drill.grade(config, pure_raise, "raise")
    fold_grade = drill.grade(config, pure_fold, "fold")
    wrong_grade = drill.grade(config, pure_fold, "raise")

    assert raise_grade.correct is True
    assert raise_grade.expected.action_id == "raise"
    assert raise_grade.expected.frequency == 1.0
    assert fold_grade.correct is True
    assert fold_grade.expected.action_id == "fold"
    assert fold_grade.expected.frequency == 1.0
    assert wrong_grade.correct is False
    assert "adjacent grid cells" in wrong_grade.explanation.detail


def test_mixed_hand_accepts_each_charted_action(range_payload) -> None:
    payload = range_payload()
    payload["grid"]["A5s"] = {"raise": 0.25}
    mixed_drill = RfiDrill(RangeIndex([RangeData.model_validate(payload)]))
    config = config_for(mixed_drill, "CO")
    question = question_for(mixed_drill, config, "CO", "A5s")

    raise_grade = mixed_drill.grade(config, question, "raise")
    fold_grade = mixed_drill.grade(config, question, "fold")

    assert raise_grade.correct is True
    assert fold_grade.correct is True
    assert raise_grade.mixed is True
    assert fold_grade.mixed is True
    assert fold_grade.expected.action_id == "fold"
    assert fold_grade.expected.frequency == 0.75
    assert "mixed spot" in fold_grade.explanation.summary


def test_explanation_uses_an_before_offsuit_hand(drill: RfiDrill) -> None:
    config = config_for(drill, "CO")
    question = question_for(drill, config, "CO", "42o")

    grade = drill.grade(config, question, "fold")

    assert grade.explanation.detail.startswith("42o is an offsuit hand.")


def test_explanation_uses_singular_neighbour_verb(range_payload) -> None:
    range_data = RangeData.model_validate(range_payload())
    fixture_drill = RfiDrill(RangeIndex([range_data]))
    config = config_for(fixture_drill, "CO")
    question = question_for(fixture_drill, config, "CO", "AKs")

    grade = fixture_drill.grade(config, question, "fold")

    assert "1 is played" in grade.explanation.detail
    assert "1 are played" not in grade.explanation.detail


@pytest.mark.parametrize(
    ("table_format", "position", "position_phrase"),
    [
        ("6max", "UTG", "UTG"),
        ("8max", "UTG1", "UTG+1"),
        ("6max", "BTN", "the Button"),
    ],
)
def test_explanation_uses_position_specific_article(
    drill: RfiDrill,
    table_format: str,
    position: str,
    position_phrase: str,
) -> None:
    config = config_for(drill, position, table_format=table_format)
    question = question_for(drill, config, position, "72o")

    grade = drill.grade(config, question, "fold")

    assert grade.explanation.summary == f"72o is a pure fold from {position_phrase}."


def test_explanation_detail_uses_display_label_not_range_id(drill: RfiDrill) -> None:
    config = config_for(drill, "UTG")
    question = question_for(drill, config, "UTG", "42o")

    grade = drill.grade(config, question, "fold")

    assert "The UTG chart assigns fold 100%." in grade.explanation.detail
    assert "rfi_6max_UTG" not in grade.explanation.detail


def test_all_shipped_explanations_pass_grammar_sweep(drill: RfiDrill) -> None:
    lowercase_sentence_start = re.compile(r"(?:^|[.!?]\s+)[a-z]")

    for range_data in drill.ranges.list(spot="rfi"):
        config = config_for(
            drill,
            range_data.position,
            table_format=range_data.table_format,
        )
        for notation in canonical_hands():
            question = question_for(drill, config, range_data.position, notation)
            grade = drill.grade(config, question, "fold")
            for copy in (grade.explanation.summary, grade.explanation.detail):
                lowered = copy.lower()
                assert "  " not in copy
                assert lowercase_sentence_start.search(copy) is None
                assert not any(f" a {vowel}" in lowered for vowel in "aeiou")
                assert re.search(r"\b1 are\b", copy) is None
                assert re.search(r"rfi_(?:6max|8max)_[A-Z0-9]+", copy) is None
                assert "the UTG" not in copy
                assert "the UTG+1" not in copy


def test_sb_raise_is_wrong_when_the_chart_limps_aa(drill: RfiDrill) -> None:
    config = config_for(drill, "SB")
    question = question_for(drill, config, "SB", "AA")

    grade = drill.grade(config, question, "raise")

    assert grade.correct is False
    assert grade.expected.action_id == "limp"
    assert grade.expected.frequency == 1.0


def test_summary_groups_by_position_and_records_mistakes(drill: RfiDrill) -> None:
    config = config_for(drill, "CO", "SB")
    questions_and_actions = [
        (question_for(drill, config, "CO", "AA", 1), "raise"),
        (question_for(drill, config, "CO", "72o", 2), "raise"),
        (question_for(drill, config, "SB", "AA", 3), "limp"),
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

    assert summary.answered == 3
    assert summary.correct == 2
    assert summary.accuracy == 0.6667
    assert summary.complete is False
    assert [item.model_dump() for item in summary.breakdown] == [
        {
            "key": "CO",
            "label": "Cutoff",
            "answered": 2,
            "correct": 1,
            "accuracy": 0.5,
        },
        {
            "key": "SB",
            "label": "Small blind",
            "answered": 1,
            "correct": 1,
            "accuracy": 1.0,
        },
    ]
    assert len(summary.mistakes) == 1
    assert summary.mistakes[0].model_dump() == {
        "question_id": "q_2",
        "chosen": "raise",
        "expected": "fold",
        "position": "CO",
        "hand": "72o",
        "range_id": "rfi_6max_CO",
    }
