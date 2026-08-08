from pathlib import Path

from learner.ranges.loader import load_ranges
from learner.sources import SOURCES, source_ids

RESOURCES = Path(__file__).resolve().parents[2] / "docs" / "RESOURCES.md"


def test_served_register_agrees_with_resources_markdown() -> None:
    markdown = RESOURCES.read_text(encoding="utf-8")

    for source in SOURCES:
        marker = f"| `{source.source_id}` |"
        row = next(line for line in markdown.splitlines() if line.startswith(marker))
        if source.url is not None:
            assert f"`{source.url}`" in row
        if source.verified_on is not None:
            assert source.verified_on in row
        if source.role == "primary":
            assert "PRIMARY" in row
        elif source.role == "not-usable":
            assert "NOT USABLE" in row
        elif source.role == "fixture":
            assert "Never a real range" in row


def test_every_shipped_range_uses_a_served_source() -> None:
    registered = source_ids()
    used = {item.source_id for item in load_ranges().list()}

    assert used <= registered
