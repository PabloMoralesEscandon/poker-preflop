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

Primary source: `jl-6max-preflop-charts`.

| Position | Target VPIP | Accept | Notes |
|---|---|---|---|
| `UTG` | ~17% | 14–20% | Tightest opening range. |
| `HJ` | ~21% | 18–25% | |
| `CO` | ~27% | 24–31% | |
| `BTN` | ~45% | 40–50% | Widest by a large margin. |
| `SB` | ~40% | 34–46% | Raise-or-fold only. **No limping** — the SB chart is a pure raise-first range. |

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

Assert all of these in the test suite:

1. **Monotonic widening.** VPIP strictly increases along the position order up
   to `BTN`: `UTG < UTG1 < UTG2 < LJ < HJ < CO < BTN` (using only the positions
   the format has). `SB` is exempt — it sits below `BTN` because it is out of
   position postflop against a single opponent.
2. **All premiums are pure opens.** `AA`, `KK`, `QQ`, `JJ`, `AKs`, `AKo`, `AQs`
   open at frequency `1.0` from every position.
3. **The bottom is pure fold.** `72o`, `82o`, `83o`, `92o`, `93o`, `32o`, `42o`,
   `52o` fold from every position including `BTN`.
4. **Suited dominates offsuit.** For every rank pair `XY`, `freq(XYs) >=
   freq(XYo)` in every position. No exceptions.
5. **Higher kicker dominates.** For a fixed high card and suitedness, frequency
   is non-increasing as the kicker drops, with **one permitted exception per
   position** for the wheel-ace hands (`A5s`, `A4s`, `A3s`, `A2s`), which many
   charts open ahead of `A7s`/`A6s`. Any other inversion is a transcription
   error.
6. **Pairs never fold above 55.** All of `AA` through `55` open from every
   position.
7. **Coverage.** Every position in §2 and §3 has a file. `rfi/6max/` has 5
   files, `rfi/9max/` has 8. No `BB.json`.

## 5. Verification procedure

For each position, in order:

1. Open the primary chart. Record its exact configuration in `notes`.
2. Transcribe the grid row by row, highest rank first.
3. Run the loader's validator — it catches malformed keys and bad frequencies.
4. Run `stats.vpip` and compare to the band above.
5. Run the invariant tests in §4.
6. Record the verification date in `docs/RESOURCES.md`.

Do not transcribe all thirteen files and then test. Test each file as it is
written; a systematic mistake found on file one saves twelve repeats.
