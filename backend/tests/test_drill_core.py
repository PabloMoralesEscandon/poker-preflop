from random import Random
from typing import Any

import pytest

from learner.drills.base import (
    Action,
    AnsweredQuestion,
    BoolField,
    ChosenAction,
    ConfigSchema,
    DrillConfig,
    EnumField,
    ExpectedAction,
    Explanation,
    Grade,
    IntField,
    MultiEnumField,
    Option,
    Prompt,
    Question,
    Summary,
    validate_config_values,
)
from learner.drills.registry import DrillRegistry
from learner.errors import LearnerError


class ExampleConfig(DrillConfig):
    mode: str


class ExampleDrill:
    id = "example"
    name = "Example"
    description = "A test drill."
    version = 1

    def config_schema(self) -> ConfigSchema:
        return ConfigSchema(fields=[])

    def validate_config(self, config: dict[str, Any]) -> DrillConfig:
        return ExampleConfig.model_validate(config)

    def generate(self, config: DrillConfig, index: int, rng: Random) -> Question:
        raise NotImplementedError

    def grade(self, config: DrillConfig, question: Question, action_id: str) -> Grade:
        raise NotImplementedError

    def summarize(
        self, config: DrillConfig, answers: list[AnsweredQuestion]
    ) -> Summary:
        raise NotImplementedError


@pytest.fixture
def config_schema() -> ConfigSchema:
    return ConfigSchema(
        fields=[
            EnumField(
                key="format",
                label="Format",
                type="enum",
                default="short",
                options=[
                    Option(value="short", label="Short"),
                    Option(value="long", label="Long"),
                ],
            ),
            MultiEnumField(
                key="topics",
                label="Topics",
                type="multi_enum",
                default=["a"],
                depends_on="format",
                options_by={
                    "short": [Option(value="a", label="A")],
                    "long": [
                        Option(value="a", label="A"),
                        Option(value="b", label="B"),
                    ],
                },
            ),
            IntField(key="count", label="Count", type="int", default=5, min=1, max=10),
            BoolField(key="timed", label="Timed", type="bool", default=False),
        ]
    )


def test_registry_registers_lists_and_looks_up_drills() -> None:
    drill = ExampleDrill()
    registry = DrillRegistry([drill])

    assert registry.get("example") is drill
    assert registry.list() == [drill]


def test_registry_rejects_duplicate_ids() -> None:
    registry = DrillRegistry([ExampleDrill()])

    with pytest.raises(ValueError, match="already registered"):
        registry.register(ExampleDrill())


def test_registry_maps_missing_drill_to_domain_error() -> None:
    with pytest.raises(LearnerError) as raised:
        DrillRegistry().get("missing")

    assert raised.value.code == "drill_not_found"
    assert raised.value.status_code == 404


def test_config_validation_applies_defaults(config_schema: ConfigSchema) -> None:
    assert validate_config_values(config_schema, {}) == {
        "format": "short",
        "topics": ["a"],
        "count": 5,
        "timed": False,
    }


@pytest.mark.parametrize(
    ("config", "field"),
    [
        ({"format": "missing"}, "format"),
        ({"topics": []}, "topics"),
        ({"format": "short", "topics": ["b"]}, "topics"),
        ({"count": 11}, "count"),
        ({"count": True}, "count"),
        ({"timed": "yes"}, "timed"),
        ({"unknown": 1}, "unknown"),
    ],
)
def test_config_validation_names_the_offending_field(
    config_schema: ConfigSchema, config: dict[str, Any], field: str
) -> None:
    with pytest.raises(LearnerError) as raised:
        validate_config_values(config_schema, config)

    assert raised.value.code == "invalid_config"
    assert raised.value.status_code == 400
    assert raised.value.field == field


def make_answer(question_id: str = "q_1") -> AnsweredQuestion:
    question = Question(
        question_id=question_id,
        index=1,
        total=1,
        drill_id="example",
        prompt=Prompt(kind="example"),
        actions=[Action(id="yes", label="Yes")],
    )
    return AnsweredQuestion(
        question=question,
        action_id="yes",
        grade=Grade(
            correct=True,
            chosen=ChosenAction(action_id="yes", label="Yes"),
            expected=ExpectedAction(action_id="yes", label="Yes", frequency=1.0),
            explanation=Explanation(summary="Correct.", detail="Correct."),
        ),
    )
