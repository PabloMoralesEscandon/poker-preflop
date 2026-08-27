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
| `vs_limp` | `raise`, `check` |

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

## 9. The `vs_limp` spot, and actions that are not folds

`vs_limp` — the big blind responding to a small-blind limp — breaks an
assumption that held everywhere else: **fold is not always available.** You are
already in the pot for free, so folding is irrational, and the source chart
records fold at exactly 0.0% across all 1326 combos.

That has two consequences for anything reading these files:

1. **`check` is an action id with size `0.0`.** It is a real action that costs
   no chips, not a null or a missing value. `action_sizes_bb` must contain it.
2. **A `vs_limp` range has no folded cells.** Every one of the 169 keys is
   non-empty and `stats.vpip` is exactly `1.0`. Code that treats "empty cell" as
   the common case, or that assumes `fold` is always in the action list offered
   to the user, is wrong for this spot.

Grading needs no change: `correct = chosen frequency > 0` already handles it,
because fold simply has frequency `0` here and choosing it is incorrect — which
is the right answer.

Drills built on this spot must take the action list from the range's `actions`
and add `fold` **only when fold is a legal option**. For `vs_limp` it is not.
See `docs/ranges/BVB-CALIBRATION.md`.

## 10. The omaha game, and class-key grids (added 2026-08-21)

PLO deals four hole cards: C(52,4) = 270,725 concrete hands against
Hold'em's 1,326. A 169-cell grid is impossible, so PLO ranges are defined
over a **closed set of 47 class keys** instead of notations. Everything in
§§1–9 survives unchanged; this section records what the game dimension adds.

### 10.1 Path, id, and the `game` field

```text
backend/data/ranges/rfi/plo/6max/UTG.json   -> range_id "rfi_plo_6max_UTG"
```

Four-segment layout: `{spot}/{game}/{table_format}/{POSITION}.json`. The
legacy three-segment layout keeps working and implies `game: "holdem"`;
its ids are unchanged. `range_id` inserts the game segment only for non-
holdem games. `game` values are `"holdem"` (default) and `"plo"`, declared
in `learner.ranges.models.Game`.

### 10.2 Class keys

A PLO grid key names one **hand class**: `{SHAPE}.{TEXTURE}` — seven pair
tiers (`AA`…`TT`, `99-66`, `55-22`) and eight non-pair shapes (`0G`, `1G`,
`2G`, `A-KT`, `A-96`, `A-52`, `OA`, `Oth`) × three textures (`ds`, `ss`,
`r`) — plus fold-only `Trips` and `Quads`. Tri-/quad-suited concrete hands
are graded inside the `.ss` cell of their shape. The exact classification
function is `learner/ranges/plo.py::classify`; its numeric boundaries were
fitted against the primary source and are frozen there and in
`docs/ranges/PLO-CALIBRATION.md`.

Validation mirrors §3 with one substitution: `grid` must contain **exactly
the 47 class keys**, no more and no fewer. Pure folds are still `{}`; all
frequency rules carry over verbatim.

### 10.3 Combinatorics and stats

Per-class combo counts are frozen constants in `ranges/plo.py`
(`CLASS_COMBOS`; sum = 270,725). Stats divide by 270,725 for PLO and weight
tri-/quad-suited combos at `TSQS_ALPHA = 0.65 ×` their cell frequency —
a stats-only discount justified in PLO-CALIBRATION §5; grading is never
discounted.

### 10.4 Borderline sampling without a grid

§6's Chebyshev adjacency has no meaning over class keys. The PLO analogue:
neighbours of a key are (a) same shape on the texture chain ds↔ss↔r and
(b) same texture one step along its shape ladder. The difficulty table is
otherwise §6 verbatim, implemented as `plo_difficulty_factor` /
`plo_sampling_weight` with their own unit tests.

### 10.5 Spots

Only `rfi` ships PLO data; the model rejects other spots for `game: "plo"`
until a citable source exists (see RESOURCES.md under `plocom-solver-data`
for the candidate and its blocker). Lifting that guard is a data change,
not an engine change.

## 11. The `vs_3bet` spot, hands that never reach a spot, and money already in

Added 2026-08-27. §7 says a new spot must not change these rules and that
changing them is a boss decision; this is the second such decision, after §8.
It adds two optional fields and one new idea.

The idea is that **not every hand reaches every spot.** Everywhere up to now,
all 169 hands could turn up: you are dealt them and you decide. Facing a 3-bet,
you are only there because you opened — so the hands you fold before the flop
of your own accord never arrive at all, and a chart of this spot covers your
opening range rather than the deck.

### 11.1 Path, id and actions

```text
backend/data/ranges/vs_3bet/8max/UTG_vs_BTN.json  -> "vs_3bet_8max_UTG_vs_BTN"
```

`{OPENER}_vs_{THREEBETTOR}`, the §8.1 convention unchanged. The opener is
`position` and the 3-bettor is `vs_position`, and **the 3-bettor must act after
the opener** — the reverse pair is not a hand of poker and is rejected.

| Spot | Allowed non-fold action ids |
|---|---|
| `vs_3bet` | `4bet`, `call`, `allin` |

`allin` is a shove for the remaining stack. It is rare — under 3% of any
charted range — and genuinely absent from most files, which is a fact about the
source, not a gap (VS-3BET-CALIBRATION §4.1).

### 11.2 `reach`

| Field | Rule |
|---|---|
| `reach` | array of canonical notations that arrive at the spot. Required for `vs_3bet`, forbidden elsewhere. Absent means all 169. |

Validation: non-empty, no duplicates, canonical notations only, and **every
non-empty grid cell's hand must be in it**. A hand cannot act in a spot it never
reached.

This is the field that separates two things `{}` used to conflate:

| Cell | `reach` | Means |
|---|---|---|
| `{}` | in | hero opened this hand and folds to the 3-bet |
| `{}` | out | hero never opened it; the spot does not arise |

The source draws those as two different colours. A format that could not tell
them apart would deal `72o` to a player and ask what they do now their UTG open
has been 3-bet, which is not a question about poker.

Three things consume it:

- **Sampling.** A drill on this spot draws from `reach`, not from
  `canonical_hands()`.
- **`stats.reach_combos`.** Combo-weighted size of `reach`, or the full deal
  where there is none. It is the denominator the source's own percentages use,
  so it is what a reader checks them against.
- **Validation**, as above.

`stats.combos`, `stats.vpip` and `stats.by_action` are unchanged and still
count against the full deal. Only the new field is relative to `reach`.

### 11.3 `hero_committed_bb`

| Field | Rule |
|---|---|
| `hero_committed_bb` | what hero already has in the pot, in bb. Required for `vs_3bet`, forbidden elsewhere. Must be positive and smaller than `facing_size_bb`. |

Every earlier spot could infer this: hero's money in the pot was a blind, and
the seat says which. Here it is hero's own open, and nothing else in the file
implies it — a 3bb open and a 4bb open produce different pot odds against the
same 3-bet.

It is what makes the price right. Facing a 10bb 3-bet having opened 3bb, calling
costs **7bb**, not 10bb. A drill that showed the 3-bet as the price would be out
by 43% on the number the whole decision turns on.

### 11.4 What is unchanged

169 keys, canonical notation, frequencies in `(0, 1]` rounded to two decimals,
`{}` for a fold, per-hand sums ≤ 1, combinatorics, the notation↔cards mapping,
and the §6 sampling weights all apply exactly as written. The difficulty scan
runs over the full 13×13 grid, so a hand at the edge of the opening range sees
its unreached neighbours as folds — which is right, because those are the hands
it is genuinely close to.

### 11.5 Mixed frequencies are no longer hypothetical

DRILL-2-SCOPING listed "mixed frequencies are unexercisable by shipped data" as
a live code path never seen by a user. `vs_3bet` ships 574 mixed cells across
its 28 charts, so §3's note that finer granularity than quarters "is a sign we
are over-fitting a source" needs qualifying rather than following:

Those quarters describe *implementable* charts, which round mixes away by
design. This source does not — it is solver output published as drawn bands,
and `0.42` there is the chart's own claim, not our over-fitting of it. Two
decimals is the format's limit and this data uses all of it. A chart that
states pure strategies should still be stored in quarters.
