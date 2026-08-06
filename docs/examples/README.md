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

## About `range_rfi_6max_CO.json`

Its `source_id` is `fixture-illustrative`. It is a **hand-made, uncited range**
that exists only so the 13×13 grid component has something realistic to render.
It is not a shipped range and must never be copied into `backend/data/`. The
loader rejects that `source_id` by design.

**Only its shape is contractual. Its contents are not, and they are already
known to differ from the real chart.** Verified live on 2026-08-07: the real
`rfi_6max_CO` plays `A8o`, `A9o`, `K3s`, `K4s` and `Q6s`, which this fixture
folds, and folds `22`, `54s`, `64s`, `65s`, `75s`, `86s`, `96s` and `J7s`, which
it plays. That divergence is correct and expected — one is a transcription of a
cited chart, the other is my invention.

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
