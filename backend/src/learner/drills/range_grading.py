"""Action-agnostic grading for range-backed drills."""

from dataclasses import dataclass

from learner.ranges.models import RangeData, played_frequency


@dataclass(frozen=True, slots=True)
class RangeGradeDecision:
    """The reusable decision produced from one exact range cell."""

    correct: bool
    mixed: bool
    expected_id: str
    frequencies: dict[str, float]


def grade_range_action(
    range_data: RangeData,
    notation: str,
    action_id: str,
) -> RangeGradeDecision:
    """Apply the shared positive-frequency correctness rule unchanged."""
    cell = range_data.grid[notation]
    frequencies = {action: cell.get(action, 0.0) for action in range_data.actions}
    frequencies["fold"] = max(0.0, 1.0 - played_frequency(cell))
    expected_id = max(
        [*range_data.actions, "fold"], key=lambda candidate: frequencies[candidate]
    )
    mixed = any(0.0 < frequency < 1.0 for frequency in frequencies.values())
    return RangeGradeDecision(
        correct=frequencies.get(action_id, 0.0) > 0.0,
        mixed=mixed,
        expected_id=expected_id,
        frequencies=frequencies,
    )
