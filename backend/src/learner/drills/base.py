"""Drill-agnostic interfaces, models, and configuration validation."""

from __future__ import annotations

from collections.abc import Mapping
from random import Random
from typing import Annotated, Any, Literal, Protocol, runtime_checkable

from pydantic import BaseModel, ConfigDict, Field, SerializeAsAny

from learner.errors import invalid_config


class Option(BaseModel):
    """A selectable value and its user-facing label."""

    model_config = ConfigDict(extra="forbid")

    value: str
    label: str


class EnumField(BaseModel):
    """A configuration field accepting one value from a fixed option list."""

    model_config = ConfigDict(extra="forbid")

    key: str
    label: str
    type: Literal["enum"]
    default: str
    options: list[Option]


class MultiEnumField(BaseModel):
    """A non-empty multi-select field, optionally dependent on another field."""

    model_config = ConfigDict(extra="forbid")

    key: str
    label: str
    type: Literal["multi_enum"]
    default: list[str]
    options: list[Option] | None = None
    options_by: dict[str, list[Option]] | None = None
    depends_on: str | None = None


class IntField(BaseModel):
    """A bounded integer configuration field."""

    model_config = ConfigDict(extra="forbid")

    key: str
    label: str
    type: Literal["int"]
    default: int
    min: int
    max: int


class BoolField(BaseModel):
    """A boolean configuration field."""

    model_config = ConfigDict(extra="forbid")

    key: str
    label: str
    type: Literal["bool"]
    default: bool


type ConfigField = Annotated[
    EnumField | MultiEnumField | IntField | BoolField,
    Field(discriminator="type"),
]


class ConfigSchema(BaseModel):
    """Declarative configuration form returned by a drill."""

    model_config = ConfigDict(extra="forbid")

    fields: list[ConfigField]


class DrillConfig(BaseModel):
    """Base class for a drill's validated, typed configuration."""

    model_config = ConfigDict(extra="forbid")


class Prompt(BaseModel):
    """Base for a drill-defined prompt discriminated by ``kind``."""

    model_config = ConfigDict(extra="allow")

    kind: str


class Action(BaseModel):
    """An action available for a question."""

    model_config = ConfigDict(extra="forbid")

    id: str
    label: str


class Question(BaseModel):
    """A generated drill question."""

    model_config = ConfigDict(extra="forbid")

    question_id: str
    index: int
    total: int
    drill_id: str
    prompt: SerializeAsAny[Prompt]
    actions: list[Action]


class ChosenAction(BaseModel):
    """The action selected by the learner."""

    model_config = ConfigDict(extra="forbid")

    action_id: str
    label: str


class ExpectedAction(ChosenAction):
    """The chart or rule-backed expected action."""

    frequency: float = Field(ge=0.0, le=1.0)


class Explanation(BaseModel):
    """Shared explanation text; drills may add reference metadata."""

    model_config = ConfigDict(extra="allow")

    summary: str
    detail: str


class Grade(BaseModel):
    """The drill-defined result of grading one answer."""

    model_config = ConfigDict(extra="forbid")

    correct: bool
    mixed: bool | None = None
    chosen: ChosenAction
    expected: ExpectedAction
    explanation: SerializeAsAny[Explanation]


class AnsweredQuestion(BaseModel):
    """A question paired with the grade produced for its answer."""

    model_config = ConfigDict(extra="forbid")

    question: Question
    action_id: str
    grade: Grade


class BreakdownItem(BaseModel):
    """One drill-defined summary bucket."""

    model_config = ConfigDict(extra="forbid")

    key: str
    label: str
    answered: int = Field(ge=0)
    correct: int = Field(ge=0)
    accuracy: float = Field(ge=0.0, le=1.0)


class Mistake(BaseModel):
    """Shared mistake fields; drills may attach categorisation metadata."""

    model_config = ConfigDict(extra="allow")

    question_id: str
    chosen: str
    expected: str


class Summary(BaseModel):
    """Drill-defined aggregate results without session transport metadata."""

    model_config = ConfigDict(extra="forbid")

    answered: int = Field(ge=0)
    correct: int = Field(ge=0)
    accuracy: float = Field(ge=0.0, le=1.0)
    complete: bool
    breakdown: list[BreakdownItem]
    mistakes: list[SerializeAsAny[Mistake]]


@runtime_checkable
class Drill(Protocol):
    """The extension point implemented by every drill package."""

    id: str
    name: str
    description: str
    version: int

    def config_schema(self) -> ConfigSchema: ...

    def validate_config(self, config: dict[str, Any]) -> DrillConfig: ...

    def generate(self, config: DrillConfig, index: int, rng: Random) -> Question: ...

    def grade(
        self,
        config: DrillConfig,
        question: Question,
        action_id: str,
    ) -> Grade: ...

    def summarize(
        self,
        config: DrillConfig,
        answers: list[AnsweredQuestion],
    ) -> Summary: ...


def validate_config_values(
    schema: ConfigSchema, config: Mapping[str, Any]
) -> dict[str, Any]:
    """Validate raw config against a drill's declarative schema and apply defaults."""
    field_by_key = {field.key: field for field in schema.fields}
    unknown = next((key for key in config if key not in field_by_key), None)
    if unknown is not None:
        raise invalid_config(f"Unknown configuration field {unknown}.", unknown)

    values: dict[str, Any] = {}
    for field in schema.fields:
        value = config.get(field.key, field.default)
        if isinstance(field, EnumField):
            allowed = {option.value for option in field.options}
            if not isinstance(value, str) or value not in allowed:
                raise invalid_config(
                    f"{field.key} must be one of {sorted(allowed)}.", field.key
                )
        elif isinstance(field, MultiEnumField):
            _validate_multi_enum(field, value, values)
        elif isinstance(field, IntField):
            if (
                isinstance(value, bool)
                or not isinstance(value, int)
                or not field.min <= value <= field.max
            ):
                raise invalid_config(
                    f"{field.key} must be an integer from {field.min} to {field.max}.",
                    field.key,
                )
        elif isinstance(field, BoolField) and not isinstance(value, bool):
            raise invalid_config(f"{field.key} must be a boolean.", field.key)
        values[field.key] = value
    return values


def _validate_multi_enum(
    field: MultiEnumField, value: Any, resolved: Mapping[str, Any]
) -> None:
    if not isinstance(value, list) or not value:
        raise invalid_config(f"{field.key} must be non-empty.", field.key)
    if any(not isinstance(item, str) for item in value):
        raise invalid_config(f"{field.key} contains an invalid option.", field.key)
    if len(value) != len(set(value)):
        raise invalid_config(f"{field.key} must not contain duplicates.", field.key)

    options = field.options
    if field.options_by is not None:
        dependency = field.depends_on
        if dependency is None or dependency not in resolved:
            raise invalid_config(
                f"{field.key} has an unresolved configuration dependency.", field.key
            )
        options = field.options_by.get(str(resolved[dependency]))
    if options is None:
        raise invalid_config(f"{field.key} has no options.", field.key)
    allowed = {option.value for option in options}
    if any(item not in allowed for item in value):
        raise invalid_config(f"{field.key} contains an invalid option.", field.key)
