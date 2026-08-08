"""Structured projection of the source register in docs/RESOURCES.md section 2."""

from typing import Literal

from pydantic import BaseModel, ConfigDict


class SourceRecord(BaseModel):
    """One source exposed to chart-browser clients."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    source_id: str
    name: str
    url: str | None
    role: Literal["primary", "cross-check", "not-usable", "fixture"]
    table_formats: tuple[str, ...]
    verified_on: str | None
    notes: str


SOURCES = (
    SourceRecord(
        source_id="jl-6max-preflop-charts",
        name="Online 6-max Cash Game Preflop Charts",
        url=(
            "https://jlsecrets.s3.amazonaws.com/advancedclasses/6maxcashgames/pdf/"
            "Online%206-max%20Cash%20Game%20Preflop%20Charts.pdf"
        ),
        role="primary",
        table_formats=("6max",),
        verified_on="2026-08-06",
        notes=(
            "100bb, 2.5bb opens, 3bb from SB, 5% rake capped at $3. "
            "Implementable-GTO pure strategy. RFI on p.3, facing-RFI on p.4-5."
        ),
    ),
    SourceRecord(
        source_id="jl-fullring-preflop-charts",
        name="PokerCoaching full-ring preflop charts",
        url="https://pokercoaching.com/preflop-charts/",
        role="primary",
        table_formats=("8max",),
        verified_on="2026-08-07",
        notes=("100bb, 2.5bb opens, 3bb from SB. Published as text hand ranges."),
    ),
    SourceRecord(
        source_id="gtowizard-free-study",
        name="GTO Wizard free Study matrix",
        url="https://app.gtowizard.com/",
        role="not-usable",
        table_formats=(),
        verified_on="2026-08-07",
        notes=(
            "Free tier advertised but every route to a matrix redirects to OAuth. "
            "Recorded so nobody retries it."
        ),
    ),
    SourceRecord(
        source_id="fixture-illustrative",
        name="Illustrative fixture data",
        url=None,
        role="fixture",
        table_formats=(),
        verified_on=None,
        notes=(
            "Hand-made, uncited. docs/examples only. The loader rejects it under "
            "backend/data."
        ),
    ),
)


def source_ids() -> frozenset[str]:
    """Return the stable identifiers present in the served register."""
    return frozenset(source.source_id for source in SOURCES)
