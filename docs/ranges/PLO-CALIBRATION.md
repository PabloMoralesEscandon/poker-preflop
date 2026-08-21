# PLO Calibration

Record of how the shipped PLO RFI charts (`rfi_plo_6max_*`) were derived,
fitted, and verified. The Hold'em equivalent lives in `RFI-CALIBRATION.md`;
the format rules it extends live in `RANGE-DATA-FORMAT.md` §10.

## 1. Sources

| Role | `source_id` | What was used |
|---|---|---|
| PRIMARY | `upswing-plo-rfi-guide` | Free PDF, verified **2026-08-21** (downloaded, HTTP 200). Five position tables ("Preflop Ranges by Position", pp. 5–14): UTG, HJ, CO, BTN, SB. Each row = a hand class × texture (ds/ss/r) with raise frequency, plus printed `% Dealt` and `% of RFI`. Derived by the publisher from a MonkerSolver simulation ($10/20 rake structure). |
| CROSS-CHECK | `plocom-solver-data` | Decoded MonkerSolver solve (5% rake capped 1bb), verified **2026-08-21**. RFI open totals per position and coarse hand-class buckets; explicitly free to cite with link. |

Both were opened directly during this task. No paywalled material was used;
nothing from either publisher is reproduced here beyond transcribed
frequencies into our own data files.

## 2. The taxonomy problem, and why boundaries are ours

The guide names fifteen class rows but never defines their exact set
boundaries ("0G", "1G", "A[K-T][K-T]", "Other A", …). Because every concrete
deal must map to exactly one cell, we had to fix boundaries before encoding
anything. They were **fitted against the guide's own printed numbers** using
a brute-force enumeration of all C(52,4) = 270,725 hands:

- textures come from the suit multiplicity partition of the four cards
  (r=[1,1,1,1], ss=[2,1,1], ds=[2,2], ts=[3,1], qs=[4]);
- pair tiers follow the top paired rank, so two-pair hands (AAKK, 8877)
  belong to their higher pair's tier;
- ace hands cascade through the band rows: A-KT requires **exactly** two
  non-ace ranks in K–T; A-96 and A-52 take **two or more** in their bands;
  the rest are Other A;
- ace-less hands classify by internal gaps (span − 3); a two-gap hand counts
  as 2G only when its two holes are adjacent (the guide's printed example
  9854 → holes {7,6}); otherwise Other;
- trips and quads fold everywhere (see §4).

The fit reproduced all 74 usable printed `% Dealt` figures with
**mean |Δ| = 0.12 pp** (print granularity is 0.1 pp); worst row 0.65 pp.
Because every rank set carries identical texture combo counts, predictions
depend only on *class sizes* — the data cannot distinguish alternative
partitions of equal size, which is why the guide's own example pins the 2G
split rather than the fit.

## 3. Reconstruction results

Reconstructed VPIP (Σ frequency × effective combos ÷ 270,725) against both
sources:

| Seat | Ours | Guide total | Δ | plo.com open% |
|---|---|---|---|---|
| UTG | 17.98% | 17.9% | +0.08 | 17.6% |
| HJ | 21.58% | 21.8% | −0.22 | 22.3% |
| CO | 29.68% | 30.0% | −0.32 | 30.5% |
| BTN | 45.86% | 47.2% | −1.34 | 48.6% |
| SB | 30.09% | 29.7% | +0.39 | 33.6% (+6.8 limp) |

Test tolerances: ±1.5 pp against the guide totals, ±4 pp against the
plo.com cross-check (different solves, rake structures, SB limp branch).

## 4. Known source anomalies (transcribed faithfully)

1. **SB pairs page prints AA ds 33% / ss 84% / r 93%.** Every other seat has
   AA at 100/100/100, and the row contradicts itself: its own `% of RFI`
   (7.1% × 29.7% = 2.11% of all deals) requires ≈84% of all AA played, which
   the printed frequencies cannot produce. Suspected ds/r column swap.
   Encoded as printed on purpose; flagged in `SB.json` notes. Grading
   consequence: AA.ds from SB grades correct when folding.
2. **Printed `% Dealt` sometimes exceeds mathematical availability**
   (AA 2.6% vs 2.50% max). Publisher rounding; absorbed by test tolerances.

## 5. Modelling decisions

| Decision | Value | Grounds |
|---|---|---|
| Tri-/quad-suited grading | inside the `.ss` cell | Guide p.3: excluded deliberately, "play similarly to single suited hands, but slightly tighter" |
| Stats weight for those hands | `TSQS_ALPHA = 0.65 × ss frequency` | Fitted globally against all rows (α sweep 0→1; optimum plateau 0.60–0.70) |
| Trips/Quads | fold-only classes | Cross-check bucket folds ~100% at UTG/HJ/CO/SB (BTN 1.2%); no coverage anywhere else |
| Raise sizing labels | 3.5 bb (SB 2.5 bb) | Pot-sized open arithmetic over a 1.5 bb pot; the solve's tree uses pot opens |

Grading is never affected by α: cells store frequencies per class key, and
ts/qs hands read the `.ss` cell like any other member. The discount applies
only to `stats.vpip`/`stats.combos`, where it reproduces the printed
`% Dealt` column best.
