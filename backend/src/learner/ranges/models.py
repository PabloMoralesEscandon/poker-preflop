"""Validated range models and pure starting-hand utilities."""

from __future__ import annotations

import math
from itertools import combinations, product
from random import Random
from typing import Any, Literal

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    computed_field,
    field_validator,
    model_validator,
)

RANKS = "AKQJT98765432"
SUITS = "shdc"
TOTAL_COMBOS = 1326
FREQUENCY_TOLERANCE = 1e-6

VALID_POSITIONS: dict[str, frozenset[str]] = {
    "6max": frozenset({"UTG", "HJ", "CO", "BTN", "SB"}),
    "8max": frozenset({"UTG", "UTG1", "LJ", "HJ", "CO", "BTN", "SB"}),
}


def _build_canonical_hands() -> tuple[str, ...]:
    hands: list[str] = []
    for row, first in enumerate(RANKS):
        for column, second in enumerate(RANKS):
            if row == column:
                hands.append(first + second)
            elif row < column:
                hands.append(first + second + "s")
            else:
                hands.append(second + first + "o")
    return tuple(hands)


CANONICAL_HANDS = _build_canonical_hands()
CANONICAL_HAND_SET = frozenset(CANONICAL_HANDS)


def canonical_hands() -> tuple[str, ...]:
    """Return the 169 canonical notations in 13x13 grid order."""
    return CANONICAL_HANDS


def combos(notation: str) -> int:
    """Return the number of concrete combinations represented by a notation."""
    _require_canonical(notation)
    if len(notation) == 2:
        return 6
    return 4 if notation.endswith("s") else 12


def grid_coordinates(notation: str) -> tuple[int, int]:
    """Return the notation's row and column in the standard 13x13 grid."""
    _require_canonical(notation)
    high_index = RANKS.index(notation[0])
    if len(notation) == 2:
        return high_index, high_index
    low_index = RANKS.index(notation[1])
    if notation.endswith("s"):
        return high_index, low_index
    return low_index, high_index


def cards_for_notation(notation: str, rng: Random) -> tuple[str, str]:
    """Deal one concrete, uniformly selected combo for a canonical notation."""
    _require_canonical(notation)
    high_rank = notation[0]
    low_rank = notation[1]
    if len(notation) == 2:
        first_suit, second_suit = rng.choice(tuple(combinations(SUITS, 2)))
    elif notation.endswith("s"):
        first_suit = second_suit = rng.choice(SUITS)
    else:
        first_suit, second_suit = rng.choice(
            tuple(
                (first, second)
                for first, second in product(SUITS, repeat=2)
                if first != second
            )
        )
    return high_rank + first_suit, low_rank + second_suit


def notation_for_cards(cards: tuple[str, str] | list[str]) -> str:
    """Convert two distinct concrete cards to canonical hand notation."""
    if len(cards) != 2:
        raise ValueError("Exactly two cards are required.")
    first, second = cards
    _validate_card(first)
    _validate_card(second)
    if first == second:
        raise ValueError("Cards must be distinct.")

    first_rank, first_suit = first
    second_rank, second_suit = second
    if first_rank == second_rank:
        return first_rank * 2
    high_rank, low_rank = sorted((first_rank, second_rank), key=RANKS.index)
    suffix = "s" if first_suit == second_suit else "o"
    return high_rank + low_rank + suffix


def played_frequency(cell: dict[str, float]) -> float:
    """Return the total non-fold frequency stored in one grid cell."""
    return sum(cell.values())


def difficulty_factor(notation: str, grid: dict[str, dict[str, float]]) -> int:
    """Return the contract's borderline-sampling difficulty multiplier."""
    row, column = grid_coordinates(notation)
    frequency = played_frequency(grid[notation])
    if 0.0 < frequency < 1.0:
        return 6

    played = frequency > 0.0
    for neighbour, cell in grid.items():
        neighbour_row, neighbour_column = grid_coordinates(neighbour)
        if max(abs(row - neighbour_row), abs(column - neighbour_column)) > 1:
            continue
        if (played_frequency(cell) > 0.0) != played:
            return 4
    return 1


def sampling_weight(notation: str, grid: dict[str, dict[str, float]]) -> int:
    """Return the borderline-mode weight: combos times difficulty factor.

    Uniform mode uses ``combos(notation)`` directly.
    """
    return combos(notation) * difficulty_factor(notation, grid)


def _require_canonical(notation: str) -> None:
    if notation not in CANONICAL_HAND_SET:
        raise ValueError(f"Non-canonical hand notation: {notation!r}.")


def _validate_card(card: Any) -> None:
    if (
        not isinstance(card, str)
        or len(card) != 2
        or card[0] not in RANKS
        or card[1] not in SUITS
    ):
        raise ValueError(f"Invalid card notation: {card!r}.")


def _number(value: Any, field_name: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError(f"{field_name} must be a number.")
    number = float(value)
    if not math.isfinite(number):
        raise ValueError(f"{field_name} must be finite.")
    return number


class RangeStats(BaseModel):
    """Computed combo-weighted statistics returned by the range API."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    combos: float = Field(ge=0.0, le=TOTAL_COMBOS)
    vpip: float = Field(ge=0.0, le=1.0)
    hands_played: int = Field(ge=0, le=169)


class RangeData(BaseModel):
    """One strictly validated range file plus its computed statistics."""

    model_config = ConfigDict(extra="forbid")

    range_id: str
    spot: Literal["rfi"]
    table_format: Literal["6max", "8max"]
    position: str
    stack_bb: float
    open_size_bb: float
    source_id: str
    notes: str
    actions: list[str]
    grid: dict[str, dict[str, float]]

    @field_validator("stack_bb", "open_size_bb", mode="before")
    @classmethod
    def validate_numbers(cls, value: Any, info: Any) -> float:
        return _number(value, info.field_name)

    @field_validator("grid", mode="before")
    @classmethod
    def validate_grid_value_types(cls, value: Any) -> Any:
        if not isinstance(value, dict):
            raise ValueError("grid must be an object.")
        for hand, cell in value.items():
            if not isinstance(cell, dict):
                raise ValueError(f"grid[{hand!r}] must be an object; folds are {{}}.")
            for action, frequency in cell.items():
                _number(frequency, f"grid[{hand!r}][{action!r}]")
        return value

    @model_validator(mode="after")
    def validate_contract(self) -> RangeData:
        if self.position not in VALID_POSITIONS[self.table_format]:
            raise ValueError(
                f"position {self.position!r} is invalid for {self.table_format} RFI."
            )
        if self.stack_bb != 100.0:
            raise ValueError("stack_bb must be 100 for v1 ranges.")
        if self.open_size_bb <= 0.0:
            raise ValueError("open_size_bb must be positive.")
        if not self.actions:
            raise ValueError("actions must be non-empty.")
        if any(not action or action == "fold" for action in self.actions):
            raise ValueError("actions must contain non-fold action ids.")
        if len(self.actions) != len(set(self.actions)):
            raise ValueError("actions must not contain duplicates.")

        if len(self.grid) != 169:
            raise ValueError(
                f"grid must contain exactly 169 keys; found {len(self.grid)}."
            )
        grid_keys = set(self.grid)
        if grid_keys != CANONICAL_HAND_SET:
            missing = sorted(CANONICAL_HAND_SET - grid_keys)
            unexpected = sorted(grid_keys - CANONICAL_HAND_SET)
            raise ValueError(
                "grid keys must be canonical; "
                f"missing={missing}, unexpected={unexpected}."
            )

        declared_actions = set(self.actions)
        used_actions: set[str] = set()
        for hand, cell in self.grid.items():
            unknown = set(cell) - declared_actions
            if unknown:
                raise ValueError(
                    f"grid[{hand!r}] uses undeclared actions {sorted(unknown)}."
                )
            for action, frequency in cell.items():
                if frequency <= 0.0 or frequency > 1.0:
                    raise ValueError(
                        f"grid[{hand!r}][{action!r}] frequency must be in (0, 1]."
                    )
            if played_frequency(cell) > 1.0 + FREQUENCY_TOLERANCE:
                raise ValueError(f"grid[{hand!r}] action frequencies sum above 1.0.")
            used_actions.update(cell)
        unused = declared_actions - used_actions
        if unused:
            raise ValueError(f"actions {sorted(unused)} do not appear in grid.")
        return self

    @computed_field
    @property
    def stats(self) -> RangeStats:
        total = sum(
            played_frequency(cell) * combos(hand) for hand, cell in self.grid.items()
        )
        return RangeStats(
            combos=round(total, 4),
            vpip=round(total / TOTAL_COMBOS, 4),
            hands_played=sum(bool(cell) for cell in self.grid.values()),
        )
