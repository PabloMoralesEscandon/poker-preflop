import re
from pathlib import Path

from learner.drills.registry import registry

SRC = Path(__file__).resolve().parents[1] / "src" / "learner"


def test_transport_and_session_layers_name_no_registered_drill() -> None:
    registered_ids = {drill.id for drill in registry.list()}
    inspected = [
        path
        for directory in (SRC / "api", SRC / "sessions")
        for path in directory.rglob("*.py")
    ]

    assert inspected
    for path in inspected:
        source = path.read_text(encoding="utf-8")
        for drill_id in registered_ids:
            named = re.compile(
                rf"(?<![A-Za-z0-9_]){re.escape(drill_id)}(?![A-Za-z0-9_])"
            )
            assert named.search(source) is None, (
                f"{path.relative_to(SRC)} names registered drill id {drill_id!r}"
            )
