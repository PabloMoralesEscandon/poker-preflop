# RFI Calibration Targets

These are the acceptance criteria for RFI range data.
They exist so range correctness can be checked automatically instead of by
someone squinting at 169 cells thirteen times.

## 1. How to read this

The **chart is the source of truth**, not the table below. The bands are a smell
test: they catch a mistyped row, a shifted diagonal, or a range copied into the
wrong position. If a faithfully transcribed chart lands outside its band by a
small margin, record that in the file's `notes` and keep the chart's numbers. If
it lands outside by a lot, something was transcribed wrong.

Two different measures appear below, and confusing them has already caused one
round-trip. **Raise VPIP** is the combo-weighted share of the 1326 starting
combos that raise — that is what the §2 and §3 tables give. **Played frequency**
is the share that takes any non-fold action, raise or limp — that is what the §4
invariants use, because the small blind limps. `stats.vpip` in
RANGE-DATA-FORMAT §4 is the played measure.

## 2. 6-max, 100bb, 2.5bb opens (3bb from SB)

Primary source: `jl-6max-preflop-charts`, page 3. Verified 2026-08-06 by reading
the rendered page directly.

These are **not estimates**. They are the summary figures printed underneath
each grid in the chart itself, so the tolerance is tight — it only exists to
absorb rounding in your own combo arithmetic.

| Position | Chart action | Raise VPIP | Combos | Accept |
|---|---|---|---|---|
| `UTG` | raise | **17.0%** | 226 / 1326 | 16.5–17.5% |
| `HJ` | raise | **21.4%** | 284 / 1326 | 20.9–21.9% |
| `CO` | raise | **27.8%** | 368 / 1326 | 27.3–28.3% |
| `BTN` | raise | **43.3%** | 574 / 1326 | 42.8–43.8% |
| `SB` | raise | **24.3%** | 322 / 1326 | 23.8–24.8% |
| `SB` | **limp** | **38.0%** | 504 / 1326 | 37.5–38.5% |

If your computed VPIP lands outside these, the transcription is wrong. Do not
adjust the band.

### 2.1 The chart calls the first position "Lojack"

At a 6-max table the earliest position to act is called UTG by some sources and
Lojack by others. It is the same seat. The chart's **"Lojack" grid is our
`UTG`** and belongs in `rfi/6max/UTG.json`.

Note that this equivalence is 6-max only. At full ring, `UTG` and `LJ` are two
different seats and both exist in our position list. Do not carry the mapping
across.

### 2.2 The small blind is a three-action spot

**This corrects an earlier error in this document**, which claimed the SB was
raise-or-fold with a VPIP near 40%. It is not. The chart's SB strategy is:

```text
Raise  24.3%   322/826 of played hands (39%)
Limp   38.0%   504/826 of played hands (61%)
Fold   37.7%   500/1326
```

So `rfi/6max/SB.json` carries **two** non-fold actions:

```json
{"actions": ["raise", "limp"], "grid": {"AA": {"raise": 1.0}, "K9s": {"limp": 1.0}, "72o": {}}}
```

Nothing in the API contract or the range format needs to change — `actions` is
already a per-range list and `grid` values are already action maps, which is
exactly why they were specified that way. The RFI drill must offer three action
buttons at the SB (`Fold`, `Limp 1bb`, `Raise 3bb`) and two everywhere else,
driven by the range's `actions` list rather than by hardcoding.

Invariant §4.1 (monotonic widening) already exempts the SB and still holds.

### 2.3 This source is a pure strategy

The chart is an "Implementable GTO" simplification: where true GTO would play
three similar hands at 33% each, it plays one of them at 100% instead. Every
cell in the 6-max RFI grids is therefore a pure `1.0` or a fold — **there are no
mixed frequencies in this dataset.**

**Neither shipped dataset has a single mixed cell.** The full-ring source in §3
is published as text hand ranges, which are pure by construction, so the change
of source did not reintroduce mixed data. Every one of the twelve v1 range files
is pure.

Keep the mixed-frequency machinery anyway — it is specified, it is cheap, and
the first genuinely mixed chart we add will need it. But do not go looking for
mixed cells in the shipped data, and never invent one to make the feature
testable. **Mixed behaviour is tested with fixtures only**, and any test that
needs a mixed cell must construct it.

### 2.4 Verified compositions

Read off the rendered grids on 2026-08-06 and cross-checked
against the chart's own printed totals. Use these to catch a systematic
transcription error on the first file rather than the fifth.

**UTG (the chart's "Lojack") — 226 combos, 17.0%**

| Class | Hands | Combos |
|---|---|---|
| Pairs `AA`–`66` | 9 | 54 |
| Suited | 22 | 88 |
| Offsuit | 7 | 84 |
| **Total** | **38** | **226** |

The 22 suited hands are `A3s`+ (11), `K8s`+ (5), `Q9s`+ (3), `J9s`+ (2), `T9s`
(1). The 7 offsuit hands are `ATo`+ (4), `KJo`+ (2), `QJo` (1). `A2s`, `55` and
below, and everything else fold.

**BTN — 574 combos, 43.3%.** All thirteen pairs open, including `22`.

**SB — 322 raise + 504 limp = 826 combos played, 500 folded.** All thirteen
pairs are played. Note that `AA` is a **limp**, not a raise — which is exactly
why invariant §4.2 is written against played frequency rather than raise
frequency.


## 3. Full ring (8-max), 100bb, 2.5bb opens (3bb from SB)

Primary source: `jl-fullring-preflop-charts`. Verified 2026-08-07.

**This section used to specify 9-max against `gtowizard-free-study`.** That
source is login-gated and unusable (RESOURCES.md §2), so the format changed to
8-max full ring. The practical loss is one seat — `UTG2`, which exists only at a
9-handed table and whose range sits between `UTG1` and `LJ`. Every position that
can open is still covered at both formats.

Unlike the 6-max charts, this source publishes **text hand ranges**, so there is
nothing to read off an image. Transcribe the notation below exactly.

| Position | Combos | VPIP | Source's stated % | Range |
|---|---|---|---|---|
| `UTG` | **160** | 12.1% | 11.4% | `77+,A3s+,K9s+,QTs+,JTs,T9s,AQo+,KQo` |
| `UTG1` | **176** | 13.3% | 13.2% | `77+,A3s+,K8s+,QTs+,JTs,T9s,AJo+,KQo` |
| `LJ` | **214** | 16.1% | 15.7% | `66+,A2s+,K7s+,QTs+,JTs,T9s,ATo+,KJo+` |
| `HJ` | **260** | 19.6% | 19.6% | `55+,A2s+,K5s+,Q9s+,J9s+,T9s,ATo+,KTo+,QJo` |
| `CO` | **350** | 26.4% | 26.1% | `44+,A2s+,K5s+,Q8s+,J8s+,T8s+,97s+,87s,76s,65s,54s,A8o+,KTo+,QTo+,JTo` |
| `BTN` | **542** | 40.9% | 40.3% | `22+,A2s+,K2s+,Q3s+,J5s+,T6s+,96s+,86s+,76s,65s,54s,A3o+,K8o+,Q9o+,J9o+,T9o` |
| `SB` | **982** | 74.1% | 73.9% | `22+,A2s+,K2s+,Q2s+,J2s+,T2s+,92s+,84s+,73s+,63s+,52s+,42s+,A2o+,K2o+,Q3o+,J5o+,T6o+,96o+,86o+,75o+,65o,54o` |

**The combo count is the acceptance criterion, not the percentage.** The counts
above were derived by expanding the published notation, and your file must match
them exactly. The source's own stated percentages are shown for transparency and
disagree by up to 0.7 points — almost certainly their rounding. Where they
differ, **the notation wins**; record the discrepancy in the file's `notes`.

### 3.1 The full-ring small blind does not limp

At 6-max this source's SB limps 38% of hands (§2.2). The full-ring SB is a
**pure raise-or-fold** range at 74.1%, with no limping at all. That is not an
inconsistency to fix — they are different published strategies for different
table sizes. So `rfi/8max/SB.json` carries `"actions": ["raise"]`, while
`rfi/6max/SB.json` carries `["raise", "limp"]`.

This is the payoff for making `actions` per-range data rather than a drill-wide
constant.

### 3.2 Comparing the two formats

Full-ring `HJ`, `CO` and `BTN` should land close to their 6-max counterparts,
since the number of players still to act is the same. They do: `CO` 26.4% versus
27.8%, `BTN` 40.9% versus 43.3%. Slightly tighter is expected, not an error. Do
not "correct" one to match the other — they are separate published charts.

## 4. Structural invariants — these are hard failures

Assert all of these in the test suite.

Throughout this section, **played frequency** means the sum of a hand's action
frequencies — `sum(grid[hand].values())` — not its raise frequency. At the small
blind a limp is playing the hand, so the invariants must be written against the
total or they will fail on correct data. Only invariant 1 uses raise VPIP
specifically.

1. **Monotonic widening.** Raise VPIP strictly increases along the position
   order up to `BTN`: `UTG < UTG1 < LJ < HJ < CO < BTN` (using only the
   positions the format has; 6-max has just `UTG < HJ < CO < BTN`). `SB` is exempt — it is out of position postflop
   against a single opponent, and in this dataset it raises only 24.3%.
2. **Premiums are never folded.** `AA`, `KK`, `QQ`, `JJ`, `AKs`, `AKo`, `AQs`
   have played frequency `1.0` from every position. Note this says *played*, not
   *raised*: a limp-heavy small blind strategy may well limp some premiums, and
   that is not an error.
3. **The bottom is pure fold.** `72o`, `82o`, `83o`, `92o`, `93o`, `32o`, `42o`,
   `52o` have played frequency `0` from every position including `BTN`.
4. **Suited dominates offsuit.** For every rank pair `XY`, `played(XYs) >=
   played(XYo)` in every position. No exceptions.
5. **Higher kicker dominates.** For a fixed high card and suitedness, played
   frequency is non-increasing as the kicker drops, with **one permitted
   exception per
   position** for the wheel-ace hands (`A5s`, `A4s`, `A3s`, `A2s`), which many
   charts open ahead of `A7s`/`A6s`. Any other inversion is a transcription
   error.
6. **Pairs are contiguous from `AA`.** If a range plays a pair, it plays every
   higher pair. No range may open `66` while folding `77`.

   This is the assertion to write. It is structural, holds at every position and
   every format, and cannot go stale when a new chart lands. It still catches
   the error it needs to catch — a mistyped or shifted pair diagonal.

   **A fixed floor does not work, and this document got it wrong three times
   before admitting that.** It said `55` (wrong: 6-max UTG folds `55`), then
   `66` (wrong: full-ring UTG and UTG+1 fold `66`), and each correction was made
   by reading whichever ranges happened to exist at the time. Measured across
   all twelve shipped ranges, the floors are:

   | Floor | Ranges |
   |---|---|
   | `77` | 8max `UTG`, 8max `UTG1` |
   | `66` | 6max `UTG`, 8max `LJ` |
   | `55` | 6max `HJ`, 8max `HJ` |
   | `44` | 8max `CO` |
   | `33` | 6max `CO` |
   | `22` | `BTN` and `SB` in both formats |

   So `AA`–`77` happens to be played everywhere *today*. You may assert that as
   a secondary check, but label it as a measured property of the current data,
   not a law — the next chart set will move it. The contiguity rule above is the
   one that never moves.

   The general trap, stated once so it is not relearned: an invariant written
   from the ranges you happen to have is a description, not an invariant. Before
   asserting one, check it against the **tightest** range in every format, or
   prefer a structural property that does not reference specific hands at all.
7. **Coverage.** Every position in §2 and §3 has a file. `rfi/6max/` has 5
   files, `rfi/8max/` has 7, twelve in total. No `BB.json` in either.

## 5. Verification procedure

### 5.0 Getting the 6-max chart into a readable form

The chart is a PDF whose grids are **images** — `pdftotext` returns only the
headings, so there is nothing to parse. Render page 3 and read it:

```bash
curl -sSL -o /tmp/chart.pdf \
  "https://jlsecrets.s3.amazonaws.com/advancedclasses/6maxcashgames/pdf/Online%206-max%20Cash%20Game%20Preflop%20Charts.pdf"
pdftoppm -f 3 -l 3 -r 200 -png /tmp/chart.pdf /tmp/rfi_page
```

That produces `/tmp/rfi_page-3.png`, which holds all five 6-max RFI grids and is
comfortably legible at 200 dpi. Render at a higher `-r` if any cell is
ambiguous, or crop to a single grid. Read the image; do not guess.

The rendered PNG is a working file. It does not go in the repository — see
`docs/RESOURCES.md` §1 rule 4.

### 5.1 Per position, in order

1. Open the primary chart. Record its exact configuration in `notes`.
2. Transcribe the grid row by row, highest rank first.
3. Run the loader's validator — it catches malformed keys and bad frequencies.
4. Compute `stats` and compare to the exact figures in §2. The chart prints its
   own combo count under each grid (226, 284, 368, 574, and 322 + 504 for the
   SB); your count must match it exactly. This is a much sharper check than a
   percentage band — use it.
5. Run the invariant tests in §4.
6. Record the verification date in `docs/RESOURCES.md`.

Do not transcribe all thirteen files and then test. Test each file as it is
written; a systematic mistake found on file one saves twelve repeats.
