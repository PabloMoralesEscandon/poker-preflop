# Facing-an-RFI Calibration Targets

Acceptance criteria for the `vs_rfi` range data.

Read `RFI-CALIBRATION.md` §1 first — the raise-VPIP versus played-frequency
distinction and the "check invariants against the tightest range" lesson both
carry over unchanged.

## 1. Source

`jl-6max-preflop-charts`, **pages 4 and 5** — the same PDF already used for the
6-max opening ranges, already registered and verified. Page 4 is
"Facing RFI: In Position", page 5 is "Facing RFI: Out of Position".

Render them the same way as RFI-CALIBRATION §5.0:

```bash
pdftoppm -f 4 -l 4 -r 400 -png /tmp/chart.pdf /tmp/vsrfi_ip
pdftoppm -f 5 -l 5 -r 400 -png /tmp/chart.pdf /tmp/vsrfi_oop
```

Both pages hold multiple grids; crop with `-x -y -W -H` to read one at a time.
Grids are images — there is no text to parse.

Sizing, from the chart's own instructions on page 2: **3.5x when 3-betting in
position, 4x out of position.** The open being faced is 2.5bb (3bb from the SB).

## 2. The fourteen matchups

The chart's "LJ" is our `UTG` at 6-max — RFI-CALIBRATION §2.1. Filenames use our
names.

**In position (page 4), 3-bet size 3.5bb — six files**

`HJ_vs_UTG`, `CO_vs_UTG`, `CO_vs_HJ`, `BTN_vs_UTG`, `BTN_vs_HJ`, `BTN_vs_CO`

**Out of position (page 5), 3-bet size 4.0bb — eight files**

`SB_vs_UTG`, `SB_vs_HJ`, `SB_vs_CO`, `SB_vs_BTN`,
`BB_vs_UTG`, `BB_vs_HJ`, `BB_vs_CO`, `BB_vs_BTN`

Blind-versus-blind (page 6) is **out of scope** — it is a different spot with a
limp branch, and it gets its own directory when we do it.

## 3. The acceptance criterion is the chart's own printed totals

Every grid prints its action breakdown underneath, in combos out of 1326. Your
computed `stats.by_action` must **equal those numbers exactly**. That is a
sharper check than any band, and it is self-verifying: the chart already did the
arithmetic, so there is nothing to pre-compute here.

Record the printed totals verbatim in each file's `notes`, alongside the page
and grid position, so a later reader can re-check without re-rendering.

**Two anchors verified directly on 2026-08-08**, to catch a systematic error on
the first file rather than the fourteenth:

| Matchup | Printed | Meaning |
|---|---|---|
| `HJ_vs_UTG` | 3Bet 8.1%, **108 / 1326**; Fold 91.9%, 1218 / 1326 | **No calling range at all** |
| `BB_vs_BTN` | 3Bet 13.4%, **178** (23.6% of 754 played); Fold 84.9% is *not* this grid | 3-bet **and** call, 754 combos played |

## 4. Not every matchup has a calling range

This is the thing most likely to be "corrected" into a bug. In position against
an early open, this chart is **3-bet-or-fold** — `HJ_vs_UTG` has zero calls.
Out of position in the big blind against a late open, it defends very wide with
both actions.

So `actions` genuinely differs per file: `["3bet"]` for some, `["3bet", "call"]`
for others. Do not add an empty `call` entry for symmetry, and do not assume a
missing call range means you misread the grid — read the printed totals, which
will say so.

## 5. Structural invariants

Assert these across all fourteen. They are deliberately fewer and weaker than
the RFI set, because a defending range is not monotonic in the same way — and
because the RFI invariants were over-asserted three times and had to be walked
back each time. Write only what holds against the tightest matchup.

1. **Contiguity of pairs from `AA`** — same rule as RFI-CALIBRATION §4.6, applied
   to played frequency. If a matchup plays `66`, it plays `77`.
2. **Premiums are never folded.** `AA`, `KK`, `QQ`, `AKs` have played frequency
   `1.0` in every matchup.
3. **The bottom is pure fold.** `72o`, `82o`, `92o`, `32o`, `42o` fold in every
   matchup.
4. **Suited dominates offsuit.** `played(XYs) >= played(XYo)` everywhere.
5. **Defending widens as the raiser's position gets later.** For a fixed hero,
   total played frequency is non-decreasing across raiser position in seat order
   — e.g. `BB_vs_UTG <= BB_vs_HJ <= BB_vs_CO <= BB_vs_BTN`. Check this and report
   it, but treat a violation as a question rather than an automatic failure: a
   rake-aware chart can legitimately break it, and the right response is to raise
   it, never to adjust data so it fits.
6. **Coverage.** Exactly fourteen files, the names in §2, no others.
7. **Every action id is in the spot's closed set** (`call`, `3bet`), and
   `action_sizes_bb` covers every declared action.

## 6. Procedure

One matchup at a time: crop, read, write, validate, compare `by_action` to the
printed totals, run the invariants. Do not transcribe fourteen and then test —
that lesson cost us a full round-trip on the 6-max set.
