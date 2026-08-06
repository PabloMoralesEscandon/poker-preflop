# API Contract v1

Owner: `bob-the-boss`. **Frozen for v1.** Backend implements it exactly.
Frontend codes against it exactly. Neither side changes it — raise a blocker
instead.

Base path: `/api/v1`. All bodies are JSON, UTF-8. All timestamps are RFC 3339
UTC. Canonical example payloads live in `docs/examples/` and are referenced per
endpoint below; they are the source of truth for shape.

## 1. Vocabulary

**Table format** — `"6max"` or `"9max"`.

**Position ids** — fixed strings, never localised on the wire:

| Format | Ordered positions | Can RFI |
|---|---|---|
| `6max` | `UTG`, `HJ`, `CO`, `BTN`, `SB`, `BB` | all except `BB` |
| `9max` | `UTG`, `UTG1`, `UTG2`, `LJ`, `HJ`, `CO`, `BTN`, `SB`, `BB` | all except `BB` |

**Hand notation** — the standard 169-hand shorthand: `AA`…`22`, `AKs`…`32s`,
`AKo`…`32o`. Ranks are ordered `A K Q J T 9 8 7 6 5 4 3 2`; the higher rank is
always written first. This is the only key format used in range grids.

**Card notation** — rank + lowercase suit: `Ah`, `Ks`, `Td`, `2c`. Suits are
`s` (spades), `h` (hearts), `d` (diamonds), `c` (clubs).

## 2. `GET /health`

```json
{"status": "ok", "version": "0.1.0"}
```

## 3. `GET /drills`

Lists available drills and the declarative schema the frontend uses to render
each drill's configuration form.

Example: `docs/examples/drills.json`

```json
{
  "drills": [
    {
      "id": "rfi",
      "name": "Raise First In",
      "description": "Decide whether to open-raise or fold when the pot is unopened.",
      "version": 1,
      "config_schema": {
        "fields": [
          {
            "key": "table_format",
            "label": "Table format",
            "type": "enum",
            "default": "6max",
            "options": [
              {"value": "6max", "label": "6-max"},
              {"value": "9max", "label": "9-max (full ring)"}
            ]
          },
          {
            "key": "positions",
            "label": "Positions",
            "type": "multi_enum",
            "default": ["UTG", "HJ", "CO", "BTN", "SB"],
            "depends_on": "table_format",
            "options_by": {
              "6max": [
                {"value": "UTG", "label": "UTG"},
                {"value": "HJ", "label": "Hijack"},
                {"value": "CO", "label": "Cutoff"},
                {"value": "BTN", "label": "Button"},
                {"value": "SB", "label": "Small blind"}
              ],
              "9max": [
                {"value": "UTG", "label": "UTG"},
                {"value": "UTG1", "label": "UTG+1"},
                {"value": "UTG2", "label": "UTG+2"},
                {"value": "LJ", "label": "Lojack"},
                {"value": "HJ", "label": "Hijack"},
                {"value": "CO", "label": "Cutoff"},
                {"value": "BTN", "label": "Button"},
                {"value": "SB", "label": "Small blind"}
              ]
            }
          },
          {
            "key": "question_count",
            "label": "Hands",
            "type": "int",
            "default": 25,
            "min": 5,
            "max": 200
          },
          {
            "key": "weighting",
            "label": "Hand selection",
            "type": "enum",
            "default": "borderline",
            "options": [
              {"value": "uniform", "label": "Uniform — any of the 169 hands"},
              {"value": "borderline", "label": "Borderline — favour close decisions"}
            ]
          }
        ]
      }
    }
  ]
}
```

### Field types

| `type` | Extra keys | Value shape |
|---|---|---|
| `enum` | `options` | one `option.value` |
| `multi_enum` | `options` **or** `options_by` + `depends_on` | array of `option.value`, min length 1 |
| `int` | `min`, `max` | integer within range |
| `bool` | — | boolean |

`options_by` maps the current value of the `depends_on` field to the option
list. When `depends_on` changes, the frontend resets the field to the
intersection of the current selection and the new option set, falling back to
`default` if that intersection is empty.

## 4. Sessions

### 4.1 `POST /sessions`

Request:

```json
{
  "drill_id": "rfi",
  "config": {
    "table_format": "6max",
    "positions": ["UTG", "HJ", "CO", "BTN", "SB"],
    "question_count": 25,
    "weighting": "borderline"
  },
  "seed": 12345
}
```

`seed` is optional; when omitted the server generates one and returns it, so any
session is reproducible.

Response `201`, example `docs/examples/session_create.json`:

```json
{
  "session_id": "s_01HZY8QK3M4N5P6R7S8T9V",
  "drill_id": "rfi",
  "config": {
    "table_format": "6max",
    "positions": ["UTG", "HJ", "CO", "BTN", "SB"],
    "question_count": 25,
    "weighting": "borderline"
  },
  "seed": 12345,
  "created_at": "2026-08-06T18:00:00Z"
}
```

### 4.2 `GET /sessions/{session_id}/next`

Idempotent: returns the current unanswered question. Only advances after an
answer is posted. Example `docs/examples/next_question.json`:

```json
{
  "done": false,
  "question": {
    "question_id": "q_3",
    "index": 3,
    "total": 25,
    "drill_id": "rfi",
    "prompt": {
      "kind": "rfi",
      "table_format": "6max",
      "hero_position": "CO",
      "stack_bb": 100,
      "hand": {"cards": ["Ah", "Ks"], "notation": "AKo"},
      "folded_before": ["UTG", "HJ"],
      "pot_bb": 1.5
    },
    "actions": [
      {"id": "fold", "label": "Fold"},
      {"id": "raise", "label": "Raise 2.5bb"}
    ]
  }
}
```

When the session is complete, example `docs/examples/next_done.json`:

```json
{"done": true, "question": null}
```

`actions[].label` is server-provided and already includes the sizing from the
range metadata (SB opens larger — see RANGE-DATA-FORMAT). The frontend renders
labels verbatim and never computes sizings.

### 4.3 `POST /sessions/{session_id}/answer`

Request:

```json
{"question_id": "q_3", "action_id": "raise"}
```

Response `200`, example `docs/examples/answer_correct.json`:

```json
{
  "correct": true,
  "chosen": {"action_id": "raise", "label": "Raise 2.5bb"},
  "expected": {"action_id": "raise", "label": "Raise 2.5bb", "frequency": 1.0},
  "explanation": {
    "summary": "AKo is a pure open from the cutoff.",
    "detail": "AKo is in the top 3% of hands and plays well against the three players left to act. It opens from every position at a 100% frequency.",
    "range_id": "rfi_6max_CO"
  },
  "progress": {"answered": 3, "correct": 3, "total": 25}
}
```

Mixed-frequency spots: `expected.frequency` is the raise frequency in the chart.
The grader marks the answer `correct` when the chosen action's frequency is
`>= 0.5`. When `0 < frequency < 1` the response adds:

```json
{"mixed": true}
```

and `explanation.summary` must say so. Examples:
`docs/examples/answer_incorrect.json`, `docs/examples/answer_mixed.json`. A mixed hand answered either way is
**not** marked incorrect; it returns `"correct": true` plus `"mixed": true` so
the UI can show it as "acceptable — this is a mixed spot".

Answering a `question_id` that is not the current question → `409` with code
`question_out_of_order`. Answering the same question twice → `409` with code
`question_already_answered`.

### 4.4 `GET /sessions/{session_id}/summary`

Available at any time; reflects answers so far. Example
`docs/examples/summary.json`:

```json
{
  "session_id": "s_01HZY8QK3M4N5P6R7S8T9V",
  "drill_id": "rfi",
  "answered": 25,
  "correct": 21,
  "accuracy": 0.84,
  "complete": true,
  "breakdown": [
    {"key": "UTG", "label": "UTG", "answered": 5, "correct": 3, "accuracy": 0.6},
    {"key": "HJ", "label": "Hijack", "answered": 5, "correct": 4, "accuracy": 0.8},
    {"key": "CO", "label": "Cutoff", "answered": 5, "correct": 5, "accuracy": 1.0},
    {"key": "BTN", "label": "Button", "answered": 5, "correct": 5, "accuracy": 1.0},
    {"key": "SB", "label": "Small blind", "answered": 5, "correct": 4, "accuracy": 0.8}
  ],
  "mistakes": [
    {
      "question_id": "q_7",
      "position": "UTG",
      "hand": "K9s",
      "chosen": "raise",
      "expected": "fold",
      "range_id": "rfi_6max_UTG"
    }
  ]
}
```

`breakdown` is drill-defined (RFI groups by position). The frontend renders it
generically from `key`/`label`/`accuracy` and must not assume positions.

## 5. Ranges

### 5.1 `GET /ranges?spot=rfi&table_format=6max`

Both query params optional; they filter. Example `docs/examples/ranges_list.json`:

```json
{
  "ranges": [
    {"range_id": "rfi_6max_UTG", "spot": "rfi", "table_format": "6max", "position": "UTG", "stack_bb": 100},
    {"range_id": "rfi_6max_CO", "spot": "rfi", "table_format": "6max", "position": "CO", "stack_bb": 100}
  ]
}
```

### 5.2 `GET /ranges/{range_id}`

Example `docs/examples/range_rfi_6max_CO.json`. Full shape in
RANGE-DATA-FORMAT.md — the API returns the stored file plus a computed `stats`
block:

```json
{
  "range_id": "rfi_6max_CO",
  "spot": "rfi",
  "table_format": "6max",
  "position": "CO",
  "stack_bb": 100,
  "open_size_bb": 2.5,
  "source_id": "jl-6max-preflop-charts",
  "notes": "100bb, 2.5bb opens, 5% rake capped at $3.",
  "actions": ["raise"],
  "grid": {"AA": {"raise": 1.0}, "AKo": {"raise": 1.0}, "K5s": {"raise": 0.5}, "72o": {}},
  "stats": {"combos": 328.0, "vpip": 0.2474, "hands_played": 65}
}
```

The values above are elided from `docs/examples/range_rfi_6max_CO.json` and
agree with it exactly. That fixture is the authority; this block is only here so
the shape is readable in context.

A range with more than one non-fold action — the small blind, which raises or
limps — looks like this:

```json
{"actions": ["raise", "limp"], "grid": {"AA": {"raise": 1.0}, "K9s": {"limp": 1.0}, "72o": {}}}
```

`grid` contains **all 169 keys**. Each value maps a non-fold action id to a
frequency in `(0, 1]`. Zero-frequency actions are omitted, so a pure fold is the
empty object `{}`. Fold frequency is `1 - sum(values)` and is never stored.

This shape is deliberately an object rather than a bare number: RFI only ever
needs `raise`, but the same format has to carry `{"call": 0.6, "raise": 0.4}`
when the call/3-bet drills land. Do not "simplify" it to a scalar.

`stats.vpip` is combo-weighted over all non-fold frequency:
`sum(played_freq(hand) * combos(hand)) / 1326`, where `played_freq` is the sum of
the hand's action frequencies and a pair is 6 combos, a suited hand 4, an offsuit
hand 12. `stats.combos` is `sum(played_freq * combos)`. `stats.hands_played`
counts grid keys whose object is non-empty.

Ranges are static content: respond with `Cache-Control: public, max-age=3600`.

## 6. Status codes

| Code | Used for |
|---|---|
| `200` | successful GET / answer |
| `201` | session created |
| `400` | malformed body or invalid config |
| `404` | unknown session, drill, or range |
| `409` | answer out of order or duplicated |
| `422` | reserved for FastAPI validation; the app converts these to the `400` envelope |

## 7. Error envelope and codes

```json
{"error": {"code": "invalid_config", "message": "positions must be non-empty.", "field": "positions"}}
```

`field` is optional. Every code below has a worked example in
`docs/examples/errors.json`, keyed by code. Closed set for v1:

| Code | Status |
|---|---|
| `invalid_request` | 400 |
| `invalid_config` | 400 |
| `drill_not_found` | 404 |
| `session_not_found` | 404 |
| `range_not_found` | 404 |
| `question_out_of_order` | 409 |
| `question_already_answered` | 409 |
| `internal_error` | 500 |

## 8. CORS

Development: allow `http://localhost:5173` and `http://127.0.0.1:5173`, methods
`GET, POST, OPTIONS`, all headers. Origins come from an env var
`LEARNER_CORS_ORIGINS` (comma-separated) with that pair as the default.

## 9. Compatibility rules

Additive changes (a new optional field, a new drill, a new range) do not bump
the version. Anything that would break an existing client requires `/api/v2` and
a boss decision.
