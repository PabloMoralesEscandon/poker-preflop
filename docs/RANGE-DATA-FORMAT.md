# Range Data Format

Owner: `bob-the-boss`. Range files are **content**, not code. Adding 9-max or
correcting a chart must never require a code change.

## 1. Location and naming

```text
backend/data/ranges/{spot}/{table_format}/{POSITION}.json
```

Examples:

```text
backend/data/ranges/rfi/6max/CO.json      -> range_id "rfi_6max_CO"
backend/data/ranges/rfi/9max/UTG2.json    -> range_id "rfi_9max_UTG2"
```

`range_id` is always `{spot}_{table_format}_{POSITION}` and must equal the value
derived from the path. The loader asserts this.

## 2. File shape

```json
{
  "range_id": "rfi_6max_CO",
  "spot": "rfi",
  "table_format": "6max",
  "position": "CO",
  "stack_bb": 100,
  "open_size_bb": 2.5,
  "source_id": "jl-6max-preflop-charts",
  "notes": "100bb, 2.5bb opens, 5% rake capped at $3. Chart p.2.",
  "actions": ["raise"],
  "grid": {
    "AA": {"raise": 1.0},
    "AKs": {"raise": 1.0},
    "A5s": {"raise": 0.5},
    "72o": {}
  }
}
```

| Field | Type | Rule |
|---|---|---|
| `range_id` | string | must match the path-derived id |
| `spot` | string | `"rfi"` for v1 |
| `table_format` | string | `"6max"` \| `"9max"` |
| `position` | string | a valid position for the format, never `BB` for `rfi` |
| `stack_bb` | number | `100` for every v1 range |
| `open_size_bb` | number | the raise size this chart assumes; drives the action label |
| `source_id` | string | must exist in `docs/RESOURCES.md` §2 |
| `notes` | string | free text: rake, sizing, page reference, deviations |
| `actions` | string[] | non-fold action ids that appear in `grid` |
| `grid` | object | **exactly 169 keys** |

## 3. Grid rules

Validation is strict. The loader must reject a file, loudly, on any of these:

1. `grid` does not have exactly 169 keys.
2. A key is not canonical 169-hand notation (`AA`…`22`, `AKs`…`32s`,
   `AKo`…`32o`, higher rank first, no `AAs`, no `AAo`, no `KAo`).
3. A grid value contains an action id not listed in `actions`.
4. A frequency is outside `(0, 1]`, or the frequencies for one hand sum above
   `1.0` (tolerance `1e-6`).
5. `range_id` disagrees with the file path.
6. `source_id` is not a known source.

Pure folds are the empty object `{}`. Never `null`, never `{"raise": 0.0}`, never
a missing key.

Frequencies should be rounded to 2 decimals. In practice v1 charts use `1.0`,
`0.75`, `0.5`, `0.25` and `{}` only — a chart that needs finer granularity is a
sign we are over-fitting a source.

## 4. Combinatorics

Used for `stats` and for weighted hand sampling. These are the only correct
values; hardcode them, do not derive them at runtime per request.

| Hand type | Example | Combos |
|---|---|---|
| Pair | `AA` | 6 |
| Suited | `AKs` | 4 |
| Offsuit | `AKo` | 12 |

Total: `13*6 + 78*4 + 78*12 = 78 + 312 + 936 = 1326`.

## 5. Dealing a concrete hand from a notation

The RFI drill shows real cards (`Ah Ks`), not just `AKo`. Given a notation, pick
uniformly among its combos:

- Pair `XX`: choose 2 distinct suits of the 4.
- Suited `XYs`: choose 1 suit of the 4, apply to both cards.
- Offsuit `XYo`: choose 2 distinct suits, first for the higher rank.

The reverse mapping (cards → notation) must be exact and is the key used to look
up the grid.

## 6. Sampling weights

`weighting: "uniform"` samples the 169 notations weighted by combo count, so the
distribution matches real deals.

`weighting: "borderline"` biases toward decisions that are actually hard. Weight
each hand by combo count multiplied by a difficulty factor derived from the
position's chart:

| Hand's frequency in this position's chart | Factor |
|---|---|
| mixed (`0 < f < 1`) | 6 |
| pure play (`f == 1`) but within 3 grid steps of a folded neighbour | 4 |
| pure fold (`{}`) but within 3 grid steps of a played neighbour | 4 |
| everything else | 1 |

"Grid steps" is Chebyshev distance on the standard 13×13 layout (rows = higher
rank, columns = lower rank, suited above the diagonal, offsuit below). The
result is that `AA` and `72o` show up rarely while `K9s`, `A5o`, `QTo` and the
suited-connector boundary show up often. Implement this as a pure function with
its own unit test — it is the single biggest driver of whether the trainer
actually teaches anything.

## 7. Adding a new spot later

A new spot (`bb_defence`, `vs_rfi`, …) adds a directory and new action ids. It
must not change this document's rules. If it would, that is a boss decision.
