# Canonical response fixtures

These files are the shared reference point that lets the backend and the
frontend be built at the same time without waiting for each other.

- **Frontend**: the mock API adapter (`VITE_API_MODE=mock`) serves these
  verbatim. The whole app — config, drilling, feedback, summary — must work with
  the backend switched off.
- **Backend**: a conformance test asserts that real responses have the same keys
  and types as the matching fixture.

If both sides match these files, integration is a config flip.

| File | Endpoint |
|---|---|
| `drills.json` | `GET /api/v1/drills` |
| `session_create.json` | `POST /api/v1/sessions` |
| `next_question.json` | `GET /api/v1/sessions/{id}/next` |
| `next_done.json` | `GET /api/v1/sessions/{id}/next`, session finished |
| `answer_correct.json` | `POST /api/v1/sessions/{id}/answer` |
| `answer_incorrect.json` | `POST /api/v1/sessions/{id}/answer` |
| `answer_mixed.json` | `POST /api/v1/sessions/{id}/answer`, mixed-frequency hand |
| `summary.json` | `GET /api/v1/sessions/{id}/summary` |
| `ranges_list.json` | `GET /api/v1/ranges` |
| `range_rfi_6max_CO.json` | `GET /api/v1/ranges/{range_id}` |
| `errors.json` | every error envelope, keyed by error code |
| `sources.json` | `GET /api/v1/sources` — the provenance register (v2) |
| `ranges_list_v2.json` | `GET /api/v1/ranges` enriched with `stats.by_action` (v2) |
| `range_vs_rfi_6max_BB_vs_BTN.json` | `GET /api/v1/ranges/{id}` for a two-action matchup (v2) |
| `next_question_vs_rfi.json` | a `vs_rfi` question (v2) |
| `answer_vs_rfi.json` | a `vs_rfi` answer (v2) |

## About `range_rfi_6max_CO.json`

Its `source_id` is `fixture-illustrative`. It is a **hand-made, uncited range**
that exists only so the 13×13 grid component has something realistic to render.
It is not a shipped range and must never be copied into `backend/data/`. The
loader rejects that `source_id` by design.

**Only its shape is contractual. Its contents are not, and they are already
known to differ from the real chart.** Measured on 2026-08-07 against
`backend/data/ranges/rfi/6max/CO.json` — **20 of the 169 cells differ**:

- **13 side flips.** The real chart plays `A8o`, `A9o`, `K3s`, `K4s`, `Q6s`,
  which this fixture folds; and folds `22`, `54s`, `64s`, `65s`, `75s`, `86s`,
  `96s`, `J7s`, which it plays.
- **7 frequency-only differences**, where this fixture is `0.5` and the real
  chart is a pure `1.0`: `33`, `JTo`, `K5s`, `KTo`, `Q7s`, `QTo`, `T7s`.

An earlier version of this note said twelve and listed only the flips. The
frequency differences are the ones easy to miss, because both cells are
"played" and a shape comparison sails straight past them.

That divergence is correct and expected — one is a transcription of a cited
chart, the other is my invention.

**Consequence worth knowing:** this fixture has **12 mixed cells; the real 6-max
data has none**, and neither does the full-ring data (RFI-CALIBRATION §2.3). So
the mixed-answer feedback path is reachable in mock mode and unreachable against
a live backend. That is not a bug in either service. It does mean mixed
behaviour must be covered by tests and fixtures rather than by clicking through
the running app.

So: a conformance test may assert that the live response has the same keys and
types as this file. It must **never** assert that a cell matches. And nobody may
"fix" `backend/data/ranges/rfi/6max/CO.json` to agree with this fixture — the
chart wins, always.

## Comparing types

JSON has a single numeric type. `100` and `100.0` are the same value, and the
backend legitimately serialises `stack_bb` as `100.0` where this fixture writes
`100`. A conformance test must compare **JSON** types — number, string, boolean,
object, array, null — not the host language's `int` versus `float`. Treating
those as different is a false positive, not a finding.

## Changing a fixture

Don't. They are part of the frozen v1 contract. If one is wrong, report it to
`bob-the-boss` and stop — a fixture edited on one side silently breaks the
other.

## About `range_vs_rfi_6max_BB_vs_BTN.json`

Same status as the CO fixture: `source_id` is `fixture-illustrative`, the shape
is contractual and **the cells are invented**. It exists so the chart browser and
the `vs_rfi` drill UI have a realistic two-action matchup to render before the
real page-5 transcription lands. It is not the published chart and its combo
counts are not the chart's — the real `BB_vs_BTN` prints 178 combos of 3-bet out
of 754 played, this fixture has 50 out of 586.

It is deliberately a *two*-action range, because the one-action case (`rfi`) was
already covered and the interesting rendering and grading paths are the ones with
`call` and `3bet` together.

## The two `vs_rfi` fixtures and their invented numbers

`claudio-frontend` flagged this at FE-11 and it is worth writing down, because it
is exactly the kind of gap someone reads as a transcription error.

`range_vs_rfi_6max_BB_vs_BTN.json` is illustrative: **50 combos of 3-bet out of
586 played**. The real transcribed chart is **178 out of 754**. A second fixture
matchup, `HJ_vs_UTG`, was derived from it by dropping every calling cell — which
makes the *shape* real (VS-RFI-CALIBRATION §4 records that matchup as genuinely
3-bet-or-fold, so a two-button action set is authentic) while the cells remain
invented.

Neither number is a bug and neither is a transcription. Both files carry
`source_id: fixture-illustrative`, the chart browser flags them amber, and the
loader rejects that id anywhere under `backend/data/`. If you want the real
numbers, read `backend/data/ranges/vs_rfi/6max/` or
`docs/ranges/VS-RFI-CALIBRATION.md` §3.

**Now that the fourteen real matchups exist, prefer them for anything that cares
about values.** These fixtures survive only so the frontend keeps running with
the backend switched off.

## `drills.json` covers both drills

It was regenerated from the running server on 2026-08-08 and is byte-identical
to a live `GET /drills`, so the `vs_rfi` config schema in it — field key
`matchups`, option values like `BB_vs_BTN`, labels like `BB vs BTN` — is the
contract, not a guess. It was missing when FE-11 started; `claudio-frontend`
authored a schema in the mock to have something to render and independently
chose the same key and value format that `william-backend` implemented. That
they converged is luck, not design, and this fixture is what makes it neither.
