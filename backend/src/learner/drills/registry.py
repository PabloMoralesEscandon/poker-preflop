"""Drill registry."""

from collections.abc import Iterable

from learner.drills.base import Drill
from learner.drills.bvb import drill as bvb_drill
from learner.drills.rfi import drill as rfi_drill
from learner.drills.vs_rfi import drill as vs_rfi_drill
from learner.errors import LearnerError


class DrillRegistry:
    """Map stable drill ids to drill implementations."""

    def __init__(self, drills: Iterable[Drill] = ()) -> None:
        self._drills: dict[str, Drill] = {}
        for drill in drills:
            self.register(drill)

    def register(self, drill: Drill) -> None:
        """Register one drill, rejecting duplicate ids."""
        if drill.id in self._drills:
            raise ValueError(f"Drill id {drill.id!r} is already registered.")
        self._drills[drill.id] = drill

    def get(self, drill_id: str) -> Drill:
        """Return a drill or raise the contract's domain error."""
        try:
            return self._drills[drill_id]
        except KeyError as exc:
            raise LearnerError(
                code="drill_not_found",
                message=f"Unknown drill id {drill_id!r}.",
                status_code=404,
            ) from exc

    def list(self) -> list[Drill]:
        """Return drills in registration order."""
        return list(self._drills.values())


registry = DrillRegistry([rfi_drill, vs_rfi_drill, bvb_drill])
