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

## Changing a fixture

Don't. They are part of the frozen v1 contract. If one is wrong, report it to
`bob-the-boss` and stop — a fixture edited on one side silently breaks the
other.
