# Poker Preflop

A free, self-hosted web app for drilling poker preflop decisions.

Two drills ship today:

- **Raise First In** — open-raise or fold when the pot is unopened, from every
  position that can open at 6-max and 8-max full ring.
- **Facing an RFI** — fold, call or 3-bet after someone opens, across fourteen
  hero-versus-raiser matchups.

Plus a **chart browser** for studying the ranges directly, and for checking that
the charts behind the drills are worth trusting.

It is built as a drill platform rather than a single trainer: a new drill is a
module, not a rewrite. Everything it depends on is free — local range data,
open-source libraries, no accounts, no paid APIs, no subscriptions.

## Quick start

```bash
make install    # uv sync + npm install
make dev        # both services; Ctrl-C stops both
```

Then open <http://localhost:5173>. The frontend talks to the backend through the
Vite dev-server proxy, so both sides are same-origin in development and CORS
never comes up. `make help` lists every target.

Or run them by hand:

```bash
# backend  (http://localhost:8000)
cd backend && uv sync && uv run uvicorn learner.main:app --reload --port 8000

# frontend (http://localhost:5173)
cd frontend && npm install && npm run dev
```

The frontend also runs standalone against fixture data, with no backend at all:

```bash
make frontend-mock          # or: cd frontend && VITE_API_MODE=mock npm run dev
```

Live is the default. Mock is opt-in, so a misconfigured backend surfaces as an
error rather than as fixtures that look like real answers.

```bash
make check      # ruff, pytest, tsc, eslint, vitest, vite build
```

## Where the ranges come from

Every range in `backend/data/ranges/` is transcribed from a free, published
chart and cites its source. Nothing is invented, and no third-party chart is
redistributed here — only our own encoding of it, with the provenance recorded.

| Data | Source |
|---|---|
| 6-max RFI and facing-RFI | Jonathan Little, *Online 6-max Cash Game Preflop Charts* (free PDF) |
| 8-max full-ring RFI | PokerCoaching free preflop charts |

Both assume 100bb, 2.5bb opens and 3bb from the small blind.

**You do not have to take that on trust.** Each chart prints its own combo
totals, and every range file records them verbatim in `notes` alongside our
computed figures. The chart browser shows both side by side with the source URL
and verification date, so any range can be checked against its published chart
in one hop. Ranges that are illustrative fixtures rather than transcriptions are
flagged as such.

If you check one and find a discrepancy, that is worth reporting — see
[`docs/RESOURCES.md`](docs/RESOURCES.md) for what we use and what we refuse to.

## Documentation

| Document | What it settles |
|---|---|
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Stack, layout, the registries that make drills pluggable |
| [`docs/API-CONTRACT.md`](docs/API-CONTRACT.md) | Every endpoint |
| [`docs/RANGE-DATA-FORMAT.md`](docs/RANGE-DATA-FORMAT.md) | How range files are stored and validated |
| [`docs/RESOURCES.md`](docs/RESOURCES.md) | Where the poker knowledge comes from, and what we refuse to use |
| [`docs/ranges/RFI-CALIBRATION.md`](docs/ranges/RFI-CALIBRATION.md) | Acceptance criteria for the opening ranges |
| [`docs/ranges/VS-RFI-CALIBRATION.md`](docs/ranges/VS-RFI-CALIBRATION.md) | Acceptance criteria for the facing-an-RFI ranges |
| [`docs/DRILL-2-SCOPING.md`](docs/DRILL-2-SCOPING.md) | What the platform made cheap, what it made expensive |
| [`docs/examples/`](docs/examples/) | Canonical response fixtures shared by both services |

## Adding a drill

A drill is a package under `backend/src/learner/drills/` implementing the `Drill`
protocol, plus a prompt component under `frontend/src/drills/` registered by
`prompt.kind`. Registering it is one line at each composition root
(`backend/src/learner/main.py`, `frontend/src/drills/register.ts`).

Nothing in the API layer, the session loop, the config form, the summary or the
history aggregation should need to change — there is a test enforcing that the
shared layers never name a drill. If your drill requires editing them, that is a
bug in the abstraction and worth raising.

Range data is content, not code: adding or correcting a chart is a JSON change
with no code change at all.
