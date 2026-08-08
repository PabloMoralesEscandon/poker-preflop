# Range Data Format

Range files are **content**, not code. Adding a table
format or correcting a chart must never require a code change.

That claim was tested on 2026-08-07, and it **half held**. The full-ring source
changed publisher and the format changed from 9-max to 8-max. Swapping the
*chart contents* cost nothing — no grading, sampling, loading or rendering logic
moved. But the **format identifier and its position list turned out to be code**,
hardcoded in six places on the backend (two `Literal` types, two position
tuples, the label map, the config schema) and in the frontend's types and
`POSITIONS_BY_FORMAT`.

This section recorded "not a single line of logic changed" before that was
checked, which was wrong. Adding a *chart* is free. Adding a *table format* is a small, mechanical,
but real code change in both services.

If a third format ever lands (9-max, heads-up, MTT), that is the thing worth
fixing first: derive the format list and its positions from the data directory
rather than declaring them in two languages.

## 1. Location and naming

```text
backend/data/ranges/{spot}/{table_format}/{POSITION}.json
```

Examples:

```text
backend/data/ranges/rfi/6max/CO.json      -> range_id "rfi_6max_CO"
backend/data/ranges/rfi/8max/UTG1.json    -> range_id "rfi_8max_UTG1"
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
| `table_format` | string | `"6max"` \| `"8max"` |
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
| pure play (`f == 1`) with an **immediately adjacent** folded neighbour | 4 |
| pure fold (`{}`) with an **immediately adjacent** played neighbour | 4 |
| everything else | 1 |

"Adjacent" is Chebyshev distance **1** on the standard 13×13 layout — the eight
surrounding cells — using the same coordinates as §5.

The result is that `AA` and `72o` show up rarely while `K9s`, `A5o`, `QTo` and
the suited-connector boundary show up often. Implement this as a pure function
with its own unit test — it is the single biggest driver of whether the trainer
actually teaches anything.

### 6.1 Why distance 1, and not 3

**An earlier version of this section said "within 3 grid steps". That was
wrong**, and it is worth recording why so nobody widens it again.

A radius of 3 reaches up to 48 of the 169 cells. Against a real range that plays
a quarter of its hands, almost every cell then has *some* neighbour on the other
side of the boundary, so nearly everything scores 4 and the weighting collapses
back toward uniform. Measured against the real 6-max data:

| Radius | Cells scoring > 1 | Share of draws on boundary hands | `AA` | `72o` |
|---|---|---|---|---|
| 1 | 56–77 of 169 | 62–77% | 0.21% | 0.41% |
| 2 | 96–121 | 81–92% | 0.15% | 0.30% |
| 3 | 130–146 | 91–97% | 0.13% | **1.04%** |

Uniform for reference: `AA` 0.45%, `72o` 0.90%.

At radius 3 the drill was **boosting `72o` above its natural frequency** — the
single most obvious fold in poker, promoted as a "close decision". Radius 1
halves both `AA` and `72o` relative to uniform while still putting roughly
three-quarters of draws on genuinely close hands, which is the behaviour this
section was always meant to describe.

## 7. Adding a new spot later

A new spot (`bb_defence`, `vs_rfi`, …) adds a directory and new action ids. It
must not change this document's rules. If it would, that is a boss decision.

## 8. Matchup ranges (added for v2, spot `vs_rfi`)

v1 had one range per position. Facing an RFI needs one range per **pair** of
positions — hero and the raiser. §7 said a new spot must not change these rules
and that changing them is a boss decision; this is that decision, taken
2026-08-08.

### 8.1 Path and id

```text
backend/data/ranges/vs_rfi/6max/BB_vs_BTN.json  -> range_id "vs_rfi_6max_BB_vs_BTN"
backend/data/ranges/vs_rfi/6max/CO_vs_HJ.json   -> range_id "vs_rfi_6max_CO_vs_HJ"
```

The filename is `{HERO}_vs_{RAISER}`. `range_id` remains
`{spot}_{table_format}_{filename}` and must still equal the path-derived value.

### 8.2 New fields

| Field | Applies to | Rule |
|---|---|---|
| `position` | all | the **hero** — the player deciding |
| `vs_position` | matchup spots only | the raiser. Absent for `rfi`, required for `vs_rfi`, and must differ from `position` |
| `facing_size_bb` | matchup spots only | what the raiser made it, in bb. Drives the prompt and the pot odds |
| `action_sizes_bb` | all | **replaces `open_size_bb`** — a map from action id to its size |

`action_sizes_bb` must contain an entry for every id in `actions`. Examples:

```json
{"actions": ["raise"],         "action_sizes_bb": {"raise": 2.5}}
{"actions": ["3bet"],          "action_sizes_bb": {"3bet": 3.5}}
{"actions": ["call", "3bet"],  "action_sizes_bb": {"call": 2.5, "3bet": 4.0}}
```

**`open_size_bb` is retired.** The twelve v1 `rfi` files migrate to
`action_sizes_bb: {"raise": <old value>}`. That is a metadata-only edit — no grid
cell changes, and the combo totals in RFI-CALIBRATION must be identical before
and after. Assert that in a test.

### 8.3 Actions for `vs_rfi`

`call` and `3bet`; fold stays implicit as always. **Not every matchup has both.**
In the v2 source, `HJ_vs_UTG` is 3-bet-or-fold with no calling range at all
(`"actions": ["3bet"]`), while `BB_vs_BTN` has a wide one
(`"actions": ["3bet", "call"]`). A validator that assumes both are present is
wrong.

Action ids are a closed set per spot:

| Spot | Allowed non-fold action ids |
|---|---|
| `rfi` | `raise`, `limp` |
| `vs_rfi` | `call`, `3bet` |

A grid cell naming an id outside its spot's set is a load failure.

**`limp` was missing from this table when it was first written**, which would
have rejected `rfi/6max/SB.json` — a verified file with 504 combos of limp, and
the very range that motivated making `actions` per-range data in the first
place. Caught in review before any code was written.

The lesson is the same one the pairs invariant taught: **a closed set written
from memory is a guess.** When you add a spot, derive its initial set from the
files that exist —

```bash
python3 -c "import json,glob,collections; s=collections.defaultdict(set)
[s[d['spot']].update(a for c in d['grid'].values() for a in c)
 for d in (json.load(open(f)) for f in glob.glob('backend/data/ranges/*/*/*.json'))]
print({k:sorted(v) for k,v in s.items()})"
```

— then keep the declaration, because its job is catching typos like `rasie` or
`3Bet`, which no derivation can do. Declare it, but derive it once first.

Cross-spot ids stay rejected: `limp` is invalid in `vs_rfi` (you cannot limp
facing a raise) and `call`/`3bet` are invalid in `rfi`.

### 8.4 Everything else is unchanged

169 keys, canonical notation, frequencies in `(0, 1]`, empty object for a pure
fold, per-hand sum ≤ 1, combinatorics, the notation↔cards mapping, and the §6
sampling weights all apply to matchup ranges exactly as written. The
difficulty-factor scan uses the same 13×13 adjacency.
