# Blind-versus-Blind Calibration Targets

Acceptance criteria for the `vs_limp` range data and the blind-versus-blind
drill.

Read `RFI-CALIBRATION.md` §1 and `VS-RFI-CALIBRATION.md` §1.1 first — the
played-frequency definition and the sizing-multiplier correction both apply.

## 1. Source

`jl-6max-preflop-charts`, **page 6** — "Blind vs Blind", the last page of the
same PDF already used everywhere else. It holds three grids:

| Grid | What it is | Status |
|---|---|---|
| Small Blind Strategy | the SB's opening range, **decomposed by follow-up** | see §4 — not yet modelled |
| Big Blind vs SB **raise** | an ordinary facing-an-RFI spot | `vs_rfi/6max/BB_vs_SB.json`, see VS-RFI-CALIBRATION §7 |
| Big Blind vs SB **limp** | facing a limp, not a raise | **this document**, `vs_limp/6max/BB_vs_SB.json` |

Render page 6 as in RFI-CALIBRATION §5.0 and crop each grid.

## 2. The `vs_limp` spot

Facing a limp is not facing a raise, and the difference is not cosmetic:

- **You are already in for free.** There is nothing to call, so `call` is
  meaningless and `fold` is irrational. The chart confirms it — fold is
  **0.0%**, and every one of the 1326 combos takes an action.
- The actions are **`raise`** and **`check`**. `check` is a new action id and
  exists only in this spot.

| Field | Value |
|---|---|
| Path | `backend/data/ranges/vs_limp/6max/BB_vs_SB.json` |
| `range_id` | `vs_limp_6max_BB_vs_SB` |
| `position` / `vs_position` | `BB` / `SB` |
| `facing_size_bb` | **1.0** — a limp is one big blind |
| `actions` | `["raise", "check"]` |
| `action_sizes_bb` | `{"raise": 3.5, "check": 0.0}` |

The raise size comes from page 2: *"When in the big blind, facing a small blind
limp, a 3.5x raise size is used."* The limp is 1bb, so 3.5x is **3.5bb** — this
is the one place where the multiplier and the big-blind figure coincide, which
is exactly the coincidence that hid the units error in VS-RFI-CALIBRATION §1.1.
Do not let it mislead you again.

`check` has size `0.0`. It is a real action with no chips, not a missing value.

## 3. Printed totals — the acceptance criterion

Verified 2026-08-09:

```text
Raise  40.4%   536 / 1326
Check  59.6%   790 / 1326
Fold    0.0%     0 / 1326
```

536 + 790 = 1326. **Every combo is played.** Your computed `stats.by_action`
must match exactly, and `hands_played` must be **169** — all of them.

### Invariants for this spot

The RFI and vs-RFI invariant sets mostly do not apply, because nothing folds.
Assert only these:

1. **Nothing folds.** Every one of the 169 cells has played frequency `1.0`.
   `stats.vpip` is exactly `1.0`. A single empty cell is a transcription error.
2. **Premiums always raise.** `AA`, `KK`, `QQ`, `AKs` raise at frequency `1.0`.
3. **Suited dominates offsuit** for the raise action:
   `raise(XYs) >= raise(XYo)` everywhere.
4. Every action id is in `{raise, check}`, and `action_sizes_bb` covers both.

Do **not** assert pair contiguity here — checking a small pair behind is
perfectly normal and the chart does it.

## 4. What is deliberately not modelled

Page 6's **"Small Blind Strategy"** grid is a six-action composite:

| Action | Combos | | Action | Combos |
|---|---|---|---|---|
| Raise/4bet | 58 / 826 | | Limp/Raise | 68 / 826 |
| Raise/Call | 120 / 826 | | Limp/Call | 204 / 826 |
| Raise/Fold | 144 / 826 | | Limp/Fold | 232 / 826 |

Those sum to **322 raise and 504 limp — exactly the shipped
`rfi_6max_SB`.** It is the same strategy, decomposed by what the SB does *after*
the big blind reacts.

That is a useful independent confirmation that `rfi_6max_SB` is transcribed
correctly: two separately drawn grids, one on page 3 and one on page 6, agree to
the combo.

It is **not** something our range format can express. Every cell we store maps a
hand to one decision; `Raise/Fold` is two. Modelling it needs either compound
action ids — which cram two decisions into one label and teach the wrong mental
model — or a genuine two-decision drill where the opponent responds and you act
again. The second is worth building and is a larger piece of work than anything
here. It is out of scope for this document; see `DRILL-2-SCOPING.md`.
