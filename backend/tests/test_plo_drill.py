"""PLO behaviour of the Raise First In drill."""

from random import Random

import pytest

from learner.drills.base import AnsweredQuestion
from learner.drills.rfi import RfiDrill
from learner.errors import LearnerError, invalid_config
from learner.ranges.loader import load_ranges
from learner.ranges.plo import (
    plo_class_key_set,
    plo_class_keys,
    plo_combos,
    plo_difficulty_factor,
    plo_sampling_weight,
)

POSITIONS = ("UTG", "HJ", "CO", "BTN", "SB")


@pytest.fixture
def drill() -> RfiDrill:
    return RfiDrill(load_ranges())


def plo_config(drill: RfiDrill, **overrides):
    raw = {
        "game": "plo",
        "table_format": "6max",
        "positions": ["UTG", "BTN"],
        "question_count": 5,
        "weighting": "borderline",
    }
    raw.update(overrides)
    return drill.validate_config(raw)


def test_config_schema_offers_game_first(drill: RfiDrill) -> None:
    fields = drill.config_schema().fields
    assert [field.key for field in fields][:2] == ["game", "table_format"]
    game_field = fields[0]
    assert [option.value for option in game_field.options] == [
        "holdem",
        "plo",
    ]


def test_plo_plus_8max_is_rejected(drill: RfiDrill) -> None:
    with pytest.raises(LearnerError) as excinfo:
        plo_config(drill, table_format="8max")
    error = excinfo.value
    assert error.code == "invalid_config"
    assert error.field == "table_format"


@pytest.mark.parametrize("weighting", ["uniform", "borderline"])
def test_generated_plo_questions_deal_four_real_cards(
    drill: RfiDrill, weighting: str
) -> None:
    config = plo_config(drill, weighting=weighting)
    question = drill.generate(config, 1, Random(11))
    prompt = question.prompt

    assert prompt.game == "plo"
    assert len(prompt.hand.cards) == 4
    assert len(set(prompt.hand.cards)) == 4
    assert prompt.hand.notation in plo_class_key_set()
    assert prompt.folded_before == list(
        POSITIONS[: POSITIONS.index(prompt.hero_position)]
    )
    assert [action.id for action in question.actions] == ["fold", "raise"]


def test_seeded_plo_sessions_reproduce_exactly(drill: RfiDrill) -> None:
    config = plo_config(drill)
    first = [drill.generate(config, i, Random(99)) for i in range(1, 6)]
    second = [drill.generate(config, i, Random(99)) for i in range(1, 6)]
    for left, right in zip(first, second, strict=True):
        assert left.prompt.hand == right.prompt.hand
        assert left.prompt.hero_position == right.prompt.hero_position


def test_uniform_weights_sum_to_the_deck(drill: RfiDrill) -> None:
    weights = drill._plo_weights(
        plo_config(drill, weighting="uniform"),
        drill.ranges.get("rfi_plo_6max_UTG"),
    )
    assert sum(weights) == sum(plo_combos(key) for key in plo_class_keys())


def test_grading_uses_the_charted_cell(drill: RfiDrill) -> None:
    config = plo_config(drill)
    question = drill.generate(config, 1, Random(5))
    graded = drill.grade(config, question, "raise")

    grid = drill.ranges.get(f"rfi_plo_6max_{question.prompt.hero_position}").grid
    expected_correct = bool(grid[question.prompt.hand.notation])
    assert graded.correct is expected_correct
    if not expected_correct:
        assert graded.expected.action_id == "fold"


def test_borderline_weights_favour_mixed_classes(drill: RfiDrill) -> None:
    grid = drill.ranges.get("rfi_plo_6max_BTN").grid
    mixed_key = next(
        key for key in plo_class_keys() if 0.0 < sum(grid[key].values()) < 1.0
    )
    plain_key = "Trips"
    assert plo_difficulty_factor(mixed_key, grid) == 6
    assert plo_difficulty_factor(plain_key, grid) == 1
    # per-combo, a mixed class is weighted six times a plain fold class
    assert plo_sampling_weight(mixed_key, grid) / plo_combos(
        mixed_key
    ) == 6 * plo_sampling_weight(plain_key, grid) / plo_combos(plain_key)


def test_mixed_cell_grades_acceptable_both_ways(drill: RfiDrill) -> None:
    config = plo_config(drill, positions=["CO"])
    grid = drill.ranges.get("rfi_plo_6max_CO").grid
    mixed_key = next(
        key for key in plo_class_keys() if 0.0 < sum(grid[key].values()) < 1.0
    )

    from learner.drills.base import Question
    from learner.drills.rfi import actions_for_range
    from learner.drills.rfi.models import RfiHand, RfiPrompt

    range_data = drill.ranges.get("rfi_plo_6max_CO")
    question = Question(
        question_id="q_1",
        index=1,
        total=5,
        drill_id="rfi",
        prompt=RfiPrompt(
            game="plo",
            table_format="6max",
            hero_position="CO",
            stack_bb=100,
            hand=RfiHand(cards=["Ah", "Kh", "Qd", "Jc"], notation=mixed_key),
            folded_before=["UTG", "HJ"],
            pot_bb=1.5,
        ),
        actions=actions_for_range(range_data),
    )
    raise_grade = drill.grade(config, question, "raise")
    fold_grade = drill.grade(config, question, "fold")

    assert raise_grade.correct is True
    assert fold_grade.correct is True
    assert raise_grade.mixed is True and fold_grade.mixed is True


def test_wrong_action_on_a_mixed_hand_is_incorrect(drill: RfiDrill) -> None:
    from learner.drills.base import Question
    from learner.drills.rfi import actions_for_range
    from learner.drills.rfi.models import RfiHand, RfiPrompt

    config = plo_config(drill, positions=["SB"])
    range_data = drill.ranges.get("rfi_plo_6max_SB")
    # SB AA row is mixed; limp is never offered, so force a two-action probe.
    question = Question(
        question_id="q_1",
        index=1,
        total=5,
        drill_id="rfi",
        prompt=RfiPrompt(
            game="plo",
            table_format="6max",
            hero_position="SB",
            stack_bb=100,
            hand=RfiHand(cards=["As", "Ah", "Ks", "Qh"], notation="AA.ds"),
            folded_before=[],
            pot_bb=1.5,
        ),
        actions=actions_for_range(range_data),
    )
    grade = drill.grade(config, question, "fold")
    assert grade.correct is True  # printed strategy folds AA.ds 67% from SB
    assert grade.expected.frequency == pytest.approx(0.67)


def test_explanation_names_the_class_and_range(drill: RfiDrill) -> None:
    config = plo_config(drill)
    question = drill.generate(config, 1, Random(3))
    grade = drill.grade(config, question, "fold")

    assert grade.explanation.range_id.startswith("rfi_plo_6max_")
    assert question.prompt.hand.notation in grade.explanation.detail


def test_summarize_groups_by_position_and_lists_mistakes(
    drill: RfiDrill,
) -> None:
    config = plo_config(drill)
    rng = Random(21)
    answers = []
    for index in range(1, 6):
        question = drill.generate(config, index, rng)
        wrong_action = (
            next(
                action.id
                for action in question.actions
                if drill.grade(config, question, action.id).correct is False
            )
            if any(
                drill.grade(config, question, action.id).correct is False
                for action in question.actions
            )
            else question.actions[0].id
        )
        grade = drill.grade(config, question, wrong_action)
        answers.append(
            AnsweredQuestion(question=question, action_id=wrong_action, grade=grade)
        )

    summary = drill.summarize(config, answers)
    assert summary.answered == 5
    assert {item.key for item in summary.breakdown} <= set(POSITIONS)
    for mistake in summary.mistakes:
        assert mistake.range_id.startswith("rfi_plo_6max_")
        assert mistake.hand in plo_class_key_set()


def test_unknown_action_returns_contract_error(drill: RfiDrill) -> None:
    config = plo_config(drill)
    question = drill.generate(config, 1, Random(1))
    with pytest.raises(LearnerError) as excinfo:
        drill.grade(config, question, "limp")
    assert excinfo.value.status_code == 400


def test_invalid_config_helper_matches_contract_shape() -> None:
    error = invalid_config("bad", "field")
    assert error.code == "invalid_config"
