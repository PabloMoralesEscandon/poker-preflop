"""Shared table-position ordering and user-facing labels."""

from dataclasses import dataclass

POSITION_ORDER = {
    "6max": ("UTG", "HJ", "CO", "BTN", "SB", "BB"),
    "8max": ("UTG", "UTG1", "LJ", "HJ", "CO", "BTN", "SB", "BB"),
}


@dataclass(frozen=True, slots=True)
class PositionLabel:
    """A display label with its sentence-level article behavior."""

    display: str
    article: str | None = "the"

    @property
    def phrase(self) -> str:
        return f"{self.article} {self.display}" if self.article else self.display


POSITION_LABELS = {
    "UTG": PositionLabel("UTG", article=None),
    "UTG1": PositionLabel("UTG+1", article=None),
    "LJ": PositionLabel("Lojack"),
    "HJ": PositionLabel("Hijack"),
    "CO": PositionLabel("Cutoff"),
    "BTN": PositionLabel("Button"),
    "SB": PositionLabel("Small blind"),
    "BB": PositionLabel("Big blind"),
}


def folded_before(table_format: str, position: str) -> list[str]:
    """Return positions that folded before ``position`` acts."""
    order = POSITION_ORDER[table_format]
    return list(order[: order.index(position)])
