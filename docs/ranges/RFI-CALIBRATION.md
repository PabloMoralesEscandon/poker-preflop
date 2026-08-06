# RFI Calibration Targets

Owner: `bob-the-boss`. These are the acceptance criteria for RFI range data.
They exist so range correctness can be checked automatically instead of by
someone squinting at 169 cells thirteen times.

## 1. How to read this

The **chart is the source of truth**, not the table below. The bands are a smell
test: they catch a mistyped row, a shifted diagonal, or a range copied into the
wrong position. If a faithfully transcribed chart lands outside its band by a
small margin, record that in the file's `notes` and keep the chart's numbers. If
it lands outside by a lot, something was transcribed wrong.

VPIP here means combo-weighted percentage of the 1326 starting combos that open
raise, i.e. `stats.vpip` from RANGE-DATA-FORMAT §4.

## 2. 6-max, 100bb, 2.5bb opens (3bb from SB)

Primary source: `jl-6max-preflop-charts`, page 3. Verified 2026-08-06 by
bob-the-boss, who read the rendered page directly.

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

Note that this equivalence is 6-max only. At 9-max, `UTG` and `LJ` are two
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

Keep the mixed-frequency machinery anyway. It is specified, it is cheap, and the
9-max GTO Wizard data in DA-02 will exercise it. But do not go looking for mixed
cells in these five files, and do not invent them to make the feature testable —
test it with fixtures instead.

## 3. 9-max full ring, 100bb, 2.5bb opens (3bb from SB)

Primary source: `gtowizard-free-study`. Configure it to 100bb, cash, 2.5bb
opens, and record the exact configuration used in each file's `notes`.

| Position | Target VPIP | Accept |
|---|---|---|
| `UTG` | ~12% | 9–15% |
| `UTG1` | ~13% | 10–16% |
| `UTG2` | ~15% | 12–18% |
| `LJ` | ~18% | 15–21% |
| `HJ` | ~21% | 18–25% |
| `CO` | ~27% | 24–31% |
| `BTN` | ~45% | 40–50% |
| `SB` | ~40% | 34–46% |

The 9-max `HJ`, `CO`, `BTN` and `SB` ranges are close to their 6-max
counterparts because the number of players still to act is the same. If your
9-max `CO` differs from your 6-max `CO` by more than a few percent, check the
transcription before believing it.

## 4. Structural invariants — these are hard failures

Assert all of these in the test suite.

Throughout this section, **played frequency** means the sum of a hand's action
frequencies — `sum(grid[hand].values())` — not its raise frequency. At the small
blind a limp is playing the hand, so the invariants must be written against the
total or they will fail on correct data. Only invariant 1 uses raise VPIP
specifically.

1. **Monotonic widening.** Raise VPIP strictly increases along the position
   order up to `BTN`: `UTG < UTG1 < UTG2 < LJ < HJ < CO < BTN` (using only the
   positions the format has). `SB` is exempt — it is out of position postflop
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
6. **Pairs never fold above 55.** All of `AA` through `55` have played frequency
   `1.0` from every position.
7. **Coverage.** Every position in §2 and §3 has a file. `rfi/6max/` has 5
   files, `rfi/9max/` has 8. No `BB.json`.

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
