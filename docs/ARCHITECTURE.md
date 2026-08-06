# Architecture

Owner: `bob-the-boss`. This document is the contract. Agents implement against it
and do not change it unilaterally — if something here is wrong or impossible,
report it and stop; the boss amends the doc.

## 1. What this product is

A free, self-hosted web app for practising poker decisions. It is a **drill
platform**, not a single trainer. Version 1 ships exactly one drill — RFI
(Raise First In) from any position — but every layer is built so that drill #2
(defending the big blind, pot odds, c-betting, …) is a new module, not a
rewrite.

The guiding constraint from the product owner: **make learning poker as cheap as
possible**. No paid APIs, no paid data, no accounts, no subscriptions. Local
data, open-source dependencies, free reference material only.

## 2. Stack

| Layer | Choice | Why |
|---|---|---|
| Backend | Python 3.12+, FastAPI, Pydantic v2 | Poker maths, equity, and future solver integration are all strongest in Python. Pydantic gives us the response contract for free. |
| Backend deps | `uv` | Fast, lockfile-based, single tool. |
| Backend tests | `pytest` | — |
| Backend lint | `ruff` (lint + format) | One tool, no config bikeshedding. |
| Frontend | React 18 + TypeScript + Vite | Fast dev loop, standard, zero lock-in. |
| Frontend styling | Tailwind CSS | No bespoke design system to maintain. |
| Frontend routing | `react-router` | Each drill gets its own route — required for modularity. |
| Frontend tests | `vitest` + React Testing Library | — |
| Persistence (v1) | In-memory session store behind an interface | No database to run. Swappable later. |
| Persistence (client) | `localStorage` | Session history survives reloads with zero infra. |

**Not in v1, deliberately:** auth, user accounts, a database, Docker in
production, server-side analytics, websockets.

## 3. Repository layout

```text
learner/
  docs/                     # Contracts and reference. Owner: bob-the-boss.
    ARCHITECTURE.md
    API-CONTRACT.md
    RANGE-DATA-FORMAT.md
    RESOURCES.md
    ranges/RFI-CALIBRATION.md
    examples/               # Canonical response fixtures. FE mocks read these.
  backend/                  # Owner: william-backend.
    pyproject.toml
    src/learner/
      main.py               # FastAPI app factory, CORS, error handlers
      api/v1/               # Routers only. No business logic.
      drills/
        base.py             # Drill protocol + shared models
        registry.py         # id -> Drill instance
        rfi/                # Drill #1
      ranges/
        loader.py           # Reads + validates data/ranges
        models.py
      sessions/
        store.py            # SessionStore protocol
        memory.py           # In-memory implementation
    data/ranges/            # Range JSON. Owner: william-backend (DA tasks).
    tests/
  frontend/                 # Owner: claudio-frontend.
    src/
      api/                  # Generated-by-hand types + fetch client + mock adapter
      drills/
        registry.ts         # prompt.kind -> React component
        rfi/                # Drill #1 UI
      components/           # HandGrid, Card, ActionBar, ... (drill-agnostic)
      pages/
      lib/
    tests/
```

## 4. The modularity contract

This is the part that matters. Three registries, one per layer, all keyed by the
same strings.

### 4.1 Backend drill registry

Every drill implements one protocol (`backend/src/learner/drills/base.py`):

```python
class Drill(Protocol):
    id: str                       # "rfi"
    name: str                     # "Raise First In"
    description: str
    version: int

    def config_schema(self) -> ConfigSchema: ...
    def validate_config(self, config: dict) -> DrillConfig: ...
    def generate(self, config: DrillConfig, index: int, rng: Random) -> Question: ...
    def grade(self, config: DrillConfig, question: Question, action_id: str) -> Grade: ...
    def summarize(self, config: DrillConfig, answers: list[AnsweredQuestion]) -> Summary: ...
```

Adding a drill = adding a package under `drills/` and registering it. **No
changes to `api/`, `sessions/`, or `main.py`.** If adding a drill would require
touching those, the abstraction is wrong — report it.

`generate` is given an explicit seeded `Random` so sessions are reproducible.

### 4.2 Config schema is data, not code

The frontend must never hardcode a drill's options. `config_schema()` returns a
declarative field list (see API-CONTRACT §3) and the frontend renders a generic
form from it. New drill, new options, zero frontend changes to the config screen.

### 4.3 Frontend drill registry

Questions carry a `prompt.kind` discriminator. The frontend maps
`kind -> component`:

```ts
export const drillComponents: Record<string, DrillComponent> = {
  rfi: RfiPrompt,
};
```

The generic `DrillRunner` owns the session loop (config → question → answer →
feedback → next → summary). A drill component only renders the prompt and emits
an `action_id`. Everything else is shared.

### 4.4 Range data is content, not code

Ranges are JSON files validated against a schema (RANGE-DATA-FORMAT.md). Fixing
a range, or adding 9-max, is a data change with no code change.

## 5. Parallel work model

The backend and frontend are developed **simultaneously and independently**.
That is only possible because of two rules:

1. `docs/API-CONTRACT.md` is authoritative and frozen for v1. Both sides code
   against it, not against each other.
2. `docs/examples/*.json` are the canonical response fixtures. The frontend's
   mock adapter serves them verbatim; the backend has a conformance test
   asserting its real responses match their shape. If both sides match the
   fixtures, integration is a config flip.

The frontend must be fully usable — config, drilling, feedback, summary — with
the backend switched off, via `VITE_API_MODE=mock`.

## 6. Error handling

All non-2xx responses use one envelope:

```json
{"error": {"code": "session_not_found", "message": "Unknown session id."}}
```

Codes are a closed set, listed in API-CONTRACT §7. The frontend switches on
`code`, never on `message`.

## 7. Definition of done for v1

- A user opens the app, picks 6-max or 9-max and a set of positions, and drills
  RFI decisions from **any** position that can open (UTG through SB).
- Each answer gives immediate correct/incorrect feedback, the expected action,
  a one-line reason, and the full 13×13 chart for that spot.
- A session summary shows overall accuracy and accuracy per position, plus the
  hands that were missed.
- Range data is calibrated against a cited free source and passes the VPIP
  tolerance checks in `docs/ranges/RFI-CALIBRATION.md`.
- `ruff`, `pytest`, `tsc`, `vitest` all clean.
