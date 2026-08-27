# Facing-a-3-Bet Calibration Targets

Acceptance criteria for the `vs_3bet` range data.

Read `VS-RFI-CALIBRATION.md` §1.1 first — the sizing units error recorded there
is the one this spot was most likely to repeat, and §3 below is why it could
not.

This is the first spot in the repository whose source states a **mixed**
strategy, and the first whose percentages are **not out of 1326**. Both change
what "calibrated" means here, and both are the subject of §§3–5.

## 1. Source

`jl-ultimate-cash-preflop-guide` — *The Ultimate Cash Game Preflop Guide*,
2026 edition, free from PokerCoaching with no account and no email. 47 pages,
8-max cash, 100bb and 200bb, RFI through 6-bet defence.

We use **pages 13–17 only**: the 100BB VS 3-BET set, 28 grids. Render them the
way RFI-CALIBRATION §5.0 renders every other image chart:

```bash
pdftoppm -f 13 -l 17 -r 600 -png /tmp/guide.pdf /tmp/vs3bet
```

Six panels to a page, two columns by three rows, in reading order — with one
trap, recorded in §6.

### 1.1 What we deliberately do not take from it

The guide also publishes RFI, vs-RFI, vs-4-bet, vs-5-bet and 200bb ranges. None
of them ship, and the RFI pages are the ones worth naming: **this guide opens
3bb where `jl-fullring-preflop-charts` opens 2.5bb**, and its UTG range is
11.38% against that publisher's 12.1%. They are two different solves of the
same game.

RESOURCES §1.3 says one canonical source per spot and cross-checks elsewhere.
Two chart families inside one *spot* would be a blend; two chart families in
two different spots is what §1.3 actually permits. But it does leave a seam,
and the seam is real and worth stating plainly:

> The `rfi` drill teaches an 8-max opening range built on 2.5bb opens. The
> `vs_3bet` drill assumes you opened 3bb, because its charts do. A hand can be
> in one range and outside the other.

Closing it means re-transcribing the eight 8-max RFI charts from this guide and
retiring the older set — a data decision with a user-visible consequence, not a
tidy-up. **It is not taken here.** If it is ever taken, the RFI-CALIBRATION
figures change and that document is the one that has to say so.

## 2. The twenty-eight matchups

Every ordered pair where the 3-bettor acts after the opener, at 8-max:

| Opener | 3-bettors | Files |
|---|---|---:|
| `UTG` | UTG1, LJ, HJ, CO, BTN, SB, BB | 7 |
| `UTG1` | LJ, HJ, CO, BTN, SB, BB | 6 |
| `LJ` | HJ, CO, BTN, SB, BB | 5 |
| `HJ` | CO, BTN, SB, BB | 4 |
| `CO` | BTN, SB, BB | 3 |
| `BTN` | SB, BB | 2 |
| `SB` | BB | 1 |

`backend/data/ranges/vs_3bet/8max/{OPENER}_vs_{THREEBETTOR}.json`. The guide's
seat names are ours already; only `UTG+1` is spelled `UTG1` in a filename.

The reverse pairs do not exist and must not be added. `BTN_vs_UTG` would be the
button facing a 3-bet from a player who acts before it, which is not a hand of
poker; the loader rejects it.

## 3. Sizing — every number is printed on its own grid

The units error VS-RFI-CALIBRATION §1.1 records cost fourteen files. It cannot
happen here, because this guide prints absolute big blinds on every bar rather
than multipliers in an instructions paragraph:

| Read from | Says | Field |
|---|---|---|
| RFI pages 4–5 | `Raise 3bb` (`Raise 4bb` for the SB) | `hero_committed_bb` |
| vs-RFI pages 8–12 | `Raise 10bb`, or `Raise 12bb` from a blind | `facing_size_bb` |
| vs-3-bet pages 13–17 | `Raise 24bb`, `Raise 27bb`, `Raise 26.8bb` | `action_sizes_bb["4bet"]` |
| vs-3-bet pages 13–17 | `Allin 100bb` | `action_sizes_bb["allin"]` |

So: a blind 3-bets larger (12bb vs 10bb) and gets 4-bet larger in return (27bb
vs 24bb). `SB_vs_BB` is the one odd size, **26.8bb**, printed exactly like that.

`action_sizes_bb["call"]` is the 3-bet being faced, as in every `vs_*` spot.

**Read those three numbers together and the pot follows**, which is why
`hero_committed_bb` had to be a stored field rather than something the drill
infers: hero's open is not a blind and nothing else in the file implies it.
Facing `UTG_vs_BTN`, hero has 3bb in, the button has 10bb in, both blinds are
dead — a 14.5bb pot at a price of **7bb, not 10bb**. Showing a learner the
3-bet size as the price would teach the wrong pot odds by 43%.

## 4. The acceptance criterion, and its tolerance

Every grid prints four percentages above it: `Allin`, `Raise`, `Call`, `Fold`.
Those are the criterion. Unlike the vs-RFI charts, they cannot be matched
*exactly*, and the reason is worth being precise about.

**The guide draws mixed strategies as part-filled cells.** `AKs` in
`UTG_vs_BTN` is 42% 4-bet and 58% call, drawn as two bands in one rounded
rectangle. The underlying solver frequency is a real number the chart never
prints; all that survives publication is a band width. Measured at 600 dpi a
cell is about 137 pixels, so a single hand's frequency is recoverable to about
±0.7%, and a 169-cell aggregate to a few tenths of a point.

So the criterion is a band, and the band is reported rather than assumed:

> **All 112 printed figures reproduce within 0.48 pp.** The test asserts 0.6
> and a number that grows is a finding, not a knob to turn.

Printed / ours, in percentage points of hero's opening range:

| Matchup | Reach | All-in | 4-bet | Call | Fold |
|---|---:|---|---|---|---|
| `UTG_vs_UTG1` | 188 | 0.01 / 0.00 | 14.92 / 14.78 | 28.37 / 28.44 | 56.70 / 56.79 |
| `UTG_vs_LJ` | 188 | 0.04 / 0.00 | 15.12 / 15.05 | 28.77 / 28.71 | 56.07 / 56.23 |
| `UTG_vs_HJ` | 188 | 0.03 / 0.00 | 15.05 / 14.87 | 31.52 / 31.62 | 53.41 / 53.51 |
| `UTG_vs_CO` | 188 | 0.03 / 0.00 | 15.19 / 15.16 | 33.42 / 33.39 | 51.36 / 51.45 |
| `UTG_vs_BTN` | 188 | 0.22 / 0.00 | 15.40 / 15.44 | 34.45 / 34.56 | 49.93 / 50.00 |
| `UTG_vs_SB` | 188 | 0.01 / 0.00 | 8.94 / 8.46 | 39.73 / 39.97 | 51.32 / 51.57 |
| `UTG_vs_BB` | 188 | 0.01 / 0.00 | 8.97 / 8.70 | 42.16 / 42.40 | 48.86 / 48.89 |
| `UTG1_vs_LJ` | 212 | 0.91 / 0.74 | 13.69 / 13.84 | 28.88 / 28.83 | 56.53 / 56.59 |
| `UTG1_vs_HJ` | 212 | 1.47 / 1.36 | 13.55 / 13.55 | 28.57 / 28.66 | 56.41 / 56.43 |
| `UTG1_vs_CO` | 212 | 1.10 / 0.96 | 14.22 / 14.32 | 31.30 / 31.42 | 53.38 / 53.30 |
| `UTG1_vs_BTN` | 212 | 1.05 / 0.96 | 14.10 / 13.99 | 33.94 / 34.09 | 50.91 / 50.95 |
| `UTG1_vs_SB` | 212 | 0.17 / 0.00 | 9.97 / 9.87 | 40.27 / 40.42 | 49.58 / 49.72 |
| `UTG1_vs_BB` | 212 | 0.10 / 0.00 | 8.04 / 7.87 | 42.63 / 42.75 | 49.22 / 49.38 |
| `LJ_vs_HJ` | 244 | 2.95 / 2.98 | 11.78 / 11.53 | 27.04 / 27.17 | 58.23 / 58.32 |
| `LJ_vs_CO` | 244 | 2.52 / 2.46 | 12.46 / 12.21 | 28.73 / 28.80 | 56.29 / 56.53 |
| `LJ_vs_BTN` | 244 | 2.33 / 2.24 | 12.94 / 12.73 | 31.13 / 31.34 | 53.59 / 53.70 |
| `LJ_vs_SB` | 244 | 1.07 / 1.01 | 6.65 / 6.30 | 40.04 / 40.29 | 52.24 / 52.40 |
| `LJ_vs_BB` | 244 | 1.00 / 0.86 | 6.39 / 6.14 | 40.88 / 41.10 | 51.72 / 51.90 |
| `HJ_vs_CO` | 284 | 1.35 / 1.27 | 14.32 / 14.21 | 25.44 / 25.50 | 58.89 / 59.02 |
| `HJ_vs_BTN` | 284 | 1.39 / 1.29 | 14.32 / 14.30 | 29.46 / 29.47 | 54.84 / 54.94 |
| `HJ_vs_SB` | 284 | 1.33 / 1.25 | 6.23 / 6.06 | 41.95 / 42.04 | 50.50 / 50.65 |
| `HJ_vs_BB` | 284 | 2.18 / 2.13 | 5.02 / 4.77 | 44.03 / 44.11 | 48.78 / 48.99 |
| `CO_vs_BTN` | 380 | 0.12 / 0.00 | 16.57 / 16.68 | 23.93 / 23.97 | 59.39 / 59.35 |
| `CO_vs_SB` | 380 | 0.05 / 0.00 | 7.76 / 7.41 | 36.80 / 36.85 | 55.39 / 55.74 |
| `CO_vs_BB` | 380 | 0.43 / 0.38 | 7.25 / 6.91 | 38.94 / 39.04 | 53.39 / 53.67 |
| `BTN_vs_SB` | 562 | 1.16 / 1.11 | 7.30 / 7.05 | 34.01 / 34.14 | 57.53 / 57.70 |
| `BTN_vs_BB` | 562 | 0.52 / 0.47 | 7.99 / 7.75 | 37.28 / 37.49 | 54.21 / 54.30 |
| `SB_vs_BB` | 526 | 0.09 / 0.05 | 20.96 / 20.95 | 26.29 / 26.27 | 52.66 / 52.74 |

### 4.1 The all-in column, and why some of it is missing

Eleven grids ship no `allin` action at all, and every one of them prints an
all-in frequency below 0.25%. At that frequency the band is thinner than one
rendered pixel: **the guide has drawn a number it did not draw wide enough to
read.**

The honest response is to leave the action out. Adding a cell to make a total
match is inventing data to satisfy a test, which is the single thing this suite
exists to prevent. A test asserts the shape of that decision: an absent shove
must be one the chart prints below the tolerance.

Where the shove *is* visible — `LJ_vs_HJ` at 2.95%, `HJ_vs_BB` at 2.18% — it is
a real action with its own button and its own 100bb size.

## 5. Percentages are of hero's opening range, not of 1326

This is the structural difference from every earlier spot, and getting it wrong
would put numbers in the chart browser that appear nowhere in the PDF.

`UTG_vs_BTN` prints `Call 34.45%`. That is 34.45% **of the 188 combos UTG
opened**, not of 1326. A grid cell is black where hero never opened the hand,
and blue where hero opened it and now folds — two different colours for two
different things, and a range format that stores both as `{}` cannot tell them
apart.

Hence `reach`: the list of hands that arrive at the spot at all
(RANGE-DATA-FORMAT §11). It carries three consequences.

1. **`stats.reach_combos` is the denominator** a reader checks the printed
   figures against. The provenance panel divides by it and relabels its column
   `of range`.
2. **The drill deals only from `reach`.** `72o` after a 3-bet is not a hard
   question; it is not a question, because hero folded it before the 3-bet
   existed.
3. **A played cell outside `reach` is a transcription error**, and the model
   rejects it.

Reach per opener, which is that seat's opening range in this guide:

| Opener | Hands | Combos | Of 1326 |
|---|---:|---:|---:|
| `UTG` | 36 | 188 | 14.2% |
| `UTG1` | 40 | 212 | 16.0% |
| `LJ` | 44 | 244 | 18.4% |
| `HJ` | 50 | 284 | 21.4% |
| `CO` | 63 | 380 | 28.7% |
| `BTN` | 88 | 562 | 42.4% |
| `SB` | 81 | 526 | 39.7% |

Two of those want explaining.

**Reach is wider than the printed RFI percentage.** UTG's RFI page says 11.38%,
and 188 combos is 14.2%. Both are right: the RFI chart is mixed too, so 11.38%
is frequency-weighted while `reach` counts every hand opened at *any*
frequency. They measure different things.

**The SB opens fewer combos than the button.** That is not a transcription
slip. This guide's SB has a limping strategy — its RFI page reads `Raise 4bb
9.84%, Call 64.12%, Fold 26.05%`, where "call" is a limp — and a limped hand
never reaches a 3-bet of an open that did not happen. `reach` here is the SB's
*raising* range only.

## 6. The defect this transcription actually had

Worth recording, because none of the percentage checks caught it.

On page 15 the right-hand column of panels is drawn **seven pixels above** the
left-hand column. Ordering the six panels by vertical position alone therefore
interleaved the columns, and the first two grids were paired with each other's
titles: `UTG+1 vs BB` got LJ's grid and `LJ vs HJ` got UTG+1's.

Every printed figure still agreed within tolerance, because both grids were
real — just swapped. What noticed was an invariant about the data rather than
about the reading:

> One hero has one opening range. `reach` cannot depend on who 3-bet them.

UTG+1 suddenly had a 244-combo opening range in one matchup and 212 in the
other five. That is now `test_one_hero_has_one_opening_range`, and it is the
most valuable assertion in the file.

The lesson generalises the one DRILL-2-SCOPING already draws: a check that
compares our output to the source can only find errors the source would
disagree with. An error that swaps two correct readings needs a check on the
*internal consistency* of what was read.

## 7. Invariants

Asserted across all twenty-eight in `tests/test_vs_3bet_calibration.py`.

1. **Coverage.** Exactly the 28 files in §2, no others.
2. **Printed figures reproduce** within 0.6 pp, all 112 of them.
3. **One hero, one opening range** — §6.
4. **Opening ranges widen with position** across UTG → BTN. The SB is excluded
   for the limping reason in §5, and this is a check to report on, not a rule
   to bend data toward.
5. **Premiums are never given up.** `AA`, `KK`, `QQ`, `AKs` and `AKo` are in
   every `reach` and continue at frequency ≥ 0.97. The slack is rounding: a
   hand the chart never folds can read as 0.98 once its bands are stored to two
   decimals.
6. **Hands outside `reach` take no action.**
7. **Action ids are in `{call, 4bet, allin}`** and `action_sizes_bb` matches.
8. **Sizes are the printed ones**, per §3.
9. **Grid digests are frozen.** Re-measuring is legitimate; doing it silently
   is not. If a digest changes, say which grid and why, here.

There is deliberately **no suited-dominance invariant**. BVB-CALIBRATION §3
records why one was wrong for `vs_limp`, and the same argument applies with the
sign flipped: continuing frequency here is `call + 4bet + allin`, and a suited
hand that flops well can prefer calling where its offsuit twin prefers folding
*or* 4-betting as a bluff. Aggression is not strength, and neither is
continuing.

## 8. Procedure

One page at a time: render, read the six legends, measure, compare every figure
to its printed twin, then run the invariants. Do not do all five pages and then
test — §6 is what that would have missed.
