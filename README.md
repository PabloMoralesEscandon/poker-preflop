# Learner

A free, self-hosted web app for drilling poker decisions.

Version 1 covers one thing well: **RFI — should you open-raise or fold when the
pot is unopened?** — from every position at 6-max and 9-max tables. It is built
as a drill platform, so drill #2 is a module, not a rewrite.

Everything it depends on is free: local range data, open-source libraries, no
accounts, no paid APIs, no subscriptions.

## Quick start

```bash
# backend  (http://localhost:8000)
cd backend && uv sync && uv run uvicorn learner.main:app --reload

# frontend (http://localhost:5173)
cd frontend && npm install && npm run dev
```

The frontend also runs standalone against fixture data, with no backend:

```bash
cd frontend && VITE_API_MODE=mock npm run dev
```

## Documentation

Read these before changing anything.

| Document | What it settles |
|---|---|
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Stack, layout, the three registries that make drills pluggable |
| [`docs/API-CONTRACT.md`](docs/API-CONTRACT.md) | Every endpoint, frozen for v1 |
| [`docs/RANGE-DATA-FORMAT.md`](docs/RANGE-DATA-FORMAT.md) | How range files are stored and validated |
| [`docs/RESOURCES.md`](docs/RESOURCES.md) | Where our poker knowledge comes from, and what we refuse to use |
| [`docs/ranges/RFI-CALIBRATION.md`](docs/ranges/RFI-CALIBRATION.md) | Acceptance criteria for range data |
| [`docs/examples/`](docs/examples/) | Canonical response fixtures shared by both sides |

## How work is organised

Tasks live on a [Dispatch](../dispatch.json) board managed from the parent
directory. `bob-the-boss` owns the docs above, reviews the work, and merges
branches. `william-backend` owns `backend/`. `claudio-frontend` owns
`frontend/`. The contract and the fixtures are what let those two run at the
same time.

Nobody edits `docs/` except the boss.
