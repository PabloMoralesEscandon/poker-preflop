# Resources

This is the decision record for **where our poker
knowledge comes from**. Nothing in `backend/data/` may cite a source that is not
listed in §2.

## 1. Selection rules

1. **Free, no payment, ever.** If a source paywalls the material we need, it is
   not a source. A free tier is acceptable only for the parts that are actually
   free without a card.
2. **Citable.** Every range file names a `source_id` from §2, so any number in
   the repo can be traced back to something a human can open.
3. **One canonical source per spot, others as cross-checks.** Blending three
   charts produces a range that matches none of them and cannot be defended.
   Pick a primary, record deviations in the file's `notes`.
4. **We do not redistribute other people's material.** No copying chart PDFs,
   images, or page text into this repository. We encode ranges as our own data
   files, calibrated against a published chart and cited. That is a reference,
   not a reproduction.
5. **Assume nothing stays online.** Every source below carries a
   `verified` field. An agent using a source must open it and update that field
   in the same task. If a primary source is dead, stop and report it — do not
   silently substitute another chart.

## 2. Source register

`source_id` values are stable and referenced by range data files.

### Primary — preflop ranges

| `source_id` | What | URL | Role | Verified |
|---|---|---|---|---|
| `jl-6max-preflop-charts` | Visual 6-max cash preflop chart set, 6 pages. Page 3 is RFI (five 13×13 grids: Lojack, Hijack, Cutoff, Button, Small Blind); pages 4–6 cover facing an RFI in and out of position, and blind vs blind. "Implementable GTO" — a pure strategy with mixed frequencies rounded away. 100bb, 2.5bb opens, 3bb from SB. Free, no account. **Grids are images**; see RFI-CALIBRATION §5.0 for how to read them. | `https://jlsecrets.s3.amazonaws.com/advancedclasses/6maxcashgames/pdf/Online%206-max%20Cash%20Game%20Preflop%20Charts.pdf` | **PRIMARY for `rfi_6max_*`** | **2026-08-06** — HTTP 200, 1.9 MB; page 3 rendered and read, then independently reopened and transcribed |
| `jl-fullring-preflop-charts` | Full-ring (8-max) cash RFI ranges for all seven opening positions, published as **text hand ranges** rather than images — no transcription from pixels required. 100bb, 2.5bb opens, 3bb from SB. Same author as `jl-6max-preflop-charts`, so the methodology matches our 6-max data. Free, no account needed to read the ranges on the page. | `https://pokercoaching.com/preflop-charts/` | **PRIMARY for `rfi_8max_*`** | **2026-08-07** — read directly; all seven ranges captured in RFI-CALIBRATION §3 |
| `jl-ultimate-cash-preflop-guide` | Jonathan Little's *The Ultimate Cash Game Preflop Guide*, 2026 edition. Free 47-page PDF, no account, no email. 8-max cash — UTG, UTG+1, LJ, HJ, CO, BTN, SB, BB, exactly our `8max` seats — at 100bb and 200bb, covering RFI, vs RFI, vs 3-bet, vs 4-bet, vs 5-bet and vs 6-bet. We use **pages 13–17 only**: the 100bb VS 3-BET set, 28 grids. Opens are 3bb (4bb from the SB), 3-bets are 10bb in position and 12bb from a blind, 4-bets 24bb / 27bb — every size printed on the grid it belongs to. Unlike every other source here these are **genuinely mixed** solver strategies, drawn as part-filled cells, and each grid's printed percentages are **of hero's own opening range**, not of all 1326 combos. **Its RFI and vs-RFI pages are deliberately not used** — they disagree with `jl-fullring-preflop-charts` on open sizing (3bb vs 2.5bb), and mixing two chart families inside one spot is exactly what §1.3 forbids. See VS-3BET-CALIBRATION §2 for why that is a recorded seam rather than a fixed problem. | `https://poker-coaching.s3.amazonaws.com/tools/preflop-charts/The%20Ultimate%20Cash%20Game%20Preflop%20Guide.pdf` | **PRIMARY for `vs_3bet_8max_*`** | **2026-08-27** — downloaded (HTTP 200, 9.7 MB); all 28 VS 3-BET grids read, plus the RFI and vs-RFI pages for the sizings; every one of the 112 printed figures reproduced within 0.48 pp |
| `upswing-plo-rfi-guide` | Free PDF: PLO Raise-First-In guide (100bb, 6-max seats UTG–SB). Pair and non-pair class tables per position with ds/ss/r raise frequencies plus printed `% Dealt` / `% of RFI`, derived from a MonkerSolver simulation at a $10/20 rake structure. Tri- and quad-suited hands are deliberately excluded by the publisher ("play similarly to single suited hands, but slightly tighter") — we grade them in the `.ss` cell and weight them at 0.65× in stats only. The SB pairs page prints an anomalous AA row (33/84/93); transcribed as printed and flagged in the file notes and PLO-CALIBRATION §4. | `https://upswingpoker.com/wp-content/uploads/2020/04/PLO-Preflop-Guide-RFI-v4-UpswingPoker.pdf` | **PRIMARY for `rfi_plo_6max_*`** | **2026-08-21** — downloaded (HTTP 200), all five position tables transcribed from pages 5–14; taxonomy fitted so printed % Dealt reproduce within rounding (mean \|Δ\| 0.12 pp over 74 rows) |
| `plocom-solver-data` | Decoded MonkerSolver preflop dataset for PLO 6-max 100bb with 5%, 1bb-cap rake, published as HTML tables (RFI open % by position and coarse hand-class buckets; SB-vs-BTN / BB-vs-BTN / BTN-vs-CO / BB-vs-UTG defence tables). Explicitly free to cite with a link. Used as the cross-check that our reconstructed position totals track a second independent solve, and as the evidence that trips fold ~everywhere (grounds our fold-only Trips/Quads classes). | `https://plo.com/plo-6-max-opening-ranges` | cross-check for `rfi_plo_6max_*`; candidate future primary for PLO `vs_rfi` if its bucket boundaries can be pinned | **2026-08-21** — both data pages opened directly; totals recorded in PLO-CALIBRATION §5 |
| `gtowizard-free-study` | Configurable Study matrix. **Rejected as a source on 2026-08-07.** The free tier is still advertised (100 preflop solutions daily, 2.5x opens) but every route to a matrix now redirects to Google/Facebook/Apple OAuth, so nothing is reachable without an account. Kept in the register only to record the finding. | `https://app.gtowizard.com/` | **NOT USABLE** — login-gated | 2026-08-07 — gated, verified directly |
| `freebetrange-open-raises` | Opening-range PDF for 6-max cash, with written reasoning. Its blue hands are exploitative deviations, **not** part of a baseline range — exclude them. | `https://help.freebetrange.com/guides/Preflop_Charts_-_Open_Raises_in_6max_Cash_Games.pdf` | cross-check only | not yet |

### Non-source — fixtures only

| `source_id` | What |
|---|---|
| `fixture-illustrative` | Hand-made, plausible-but-uncited data used only in `docs/examples/` so the frontend has something realistic to render before the backend exists. **Never a real range.** The range loader must reject any file in `backend/data/` carrying this `source_id`, and there must be a test proving it does. |

### Supporting — rules, concepts, terminology

| `source_id` | What | URL | Verified |
|---|---|---|---|
| `pokerstars-rules` | Canonical rules and hand rankings. | `https://www.pokerstars.es/poker/games/rules/` | not yet |
| `pokerstars-strategy` | Position, odds, outs, pot odds, tilt. Plain-language definitions for UI copy. | `https://www.pokerstars.es/poker/strategy/` | not yet |
| `poker-org-beginner` | Second explanation of rules and fundamentals, no account. | `https://www.poker.org/poker-strategy/how-to-play-texas-holdem/` | not yet |
| `mit-poker-analytics` | MIT OCW "Poker Theory and Analytics" lecture videos. Background for future maths drills. | `https://ocw.mit.edu/courses/15-s50-poker-theory-and-analytics-january-iap-2015/video_galleries/lecture-videos` | not yet |

### Tools — for building and checking, not shipped

| `source_id` | What | URL |
|---|---|---|
| `poker-academy-equity` | Free hand-vs-range and range-vs-range equity calculator. Use to sanity-check future equity drills. | `https://poker.academy/equity-calculator` |
| `equilab` | Free desktop equity/range tool. Useful to confirm combo counts and VPIP percentages independently of our own code. | PokerStrategy Equilab |

### Software we may depend on

Only permissive licences (MIT / Apache-2.0 / BSD). Check the licence before
adding any of these to `pyproject.toml`.

| Library | Use | Notes |
|---|---|---|
| `pokerkit` | Hand evaluation, game state, canonical poker types. | Preferred for anything beyond preflop. Confirm licence at install time. |
| `phevaluator` / `eval7` / `treys` | Fast 5–7 card hand evaluators. | Only needed once equity drills exist. **Not needed for v1** — RFI requires no evaluator. |
| `TexasSolver` | Open-source postflop solver. | Far future, for generating postflop drill data locally. Not a v1 dependency. |

**v1 explicitly needs none of these.** RFI grading is a dictionary lookup. Do
not add a poker library to ship version 1.

### Typefaces

Same rules as everything else: free, permissively licensed, and **vendored, not
fetched**. Web fonts are installed from npm and bundled by Vite, so the app
renders identically with the network unplugged and no request for a font ever
leaves the machine. A CDN link — Google Fonts included — is not acceptable here
for the same reason a hosted range API would not be.

| Font | Licence | Use |
|---|---|---|
| Inter (`@fontsource-variable/inter`) | SIL OFL 1.1 | Interface text. |
| JetBrains Mono (`@fontsource-variable/jetbrains-mono`) | SIL OFL 1.1 | Hands, positions, sizes — anything that has to line up in a column. |
| Bebas Neue (`@fontsource/bebas-neue`) | SIL OFL 1.1 | The wordmark, page titles, and the felt's lettering. Display only; it has no lowercase worth reading at paragraph length. |

Icons and the chip mark are hand-written inline SVG in
`frontend/src/components/icons.tsx` for the same reason — no icon font, no
sprite sheet, nothing fetched.

## 3. What we deliberately do not use

- **Anything requiring a subscription** — most of FreeBetRange's chart library,
  GTO Wizard's postflop solutions, PioSolver, Simple Preflop. If a task seems to
  need one, the task is wrong.
- **Blind automated extraction.** No OCR pipeline, no colour-sampling script, no
  "parse the PDF and trust the output". Ranges are read cell by cell and typed
  in deliberately, then checked against the calibration figures.

  **Rendering a chart page to an image in order to look at it is not
  extraction — it is how you read it**, and it is required for
  `jl-6max-preflop-charts`, whose grids are images. The rule being protected
  here is that a person or agent has actually looked at every cell it is
  claiming, and that the result is checked against the source's own printed
  combo counts. The rendered image is a working file and never enters the repo.
  This paragraph corrects an earlier version of this rule that forbade reading
  image-based charts at all, which made the primary source unusable.

  **Measuring a drawn cell is reading it, under the four conditions below.**
  Amended 2026-08-27, when `jl-ultimate-cash-preflop-guide` landed. Every
  earlier source states a pure strategy: a cell is one colour and a human reads
  it as one word. That guide's cells are *split* — `AKs` is 42% 4-bet and 58%
  call, drawn as two bands inside one rounded rectangle. There is no reading of
  such a cell that does not come down to how wide the bands are, and eyeballing
  28 grids of them to two decimal places is not transcription, it is invention.
  The ban on colour sampling was written when every chart was pure. Applied
  here it would not have protected accuracy; it would have destroyed it.

  Measurement is permitted only when all four hold:

  1. **The chart states its own totals**, and our computed figures are compared
     against every one of them. This guide prints four percentages per grid;
     all 112 are recorded in `ranges/VS-3BET-CALIBRATION.md` §4 beside ours.
  2. **The agreement is reported, not asserted.** The worst case is published
     with the tolerance, and a band that widens later is a finding.
  3. **Every grid is also looked at.** That is what caught the one real defect:
     on page 15 the right-hand column of panels is drawn seven pixels above the
     left, so ordering panels by height alone paired two grids with each
     other's titles. No pixel flagged it — the per-hero combo totals did,
     because one hero cannot have two opening ranges.
  4. **The measuring code is a working file**, exactly like the rendered image.
     It ships with nothing and lives in no repository.

  What stays banned is unchanged, and is what this rule was always aimed at:
  running an extractor and committing whatever it emits. Condition 1 is the
  whole difference — the output must be checkable against something the
  publisher printed, or it is a guess with extra steps.
- **LLM-invented ranges.** A range that cannot cite a chart does not ship.
  Filling gaps by interpolating between charted neighbours is allowed, but must
  be recorded in the file's `notes`.

## 4. Adding a source

Add a row here with a new `source_id`, its URL, its role, and its verification
date. Then it can be referenced from range data. A range file citing an unknown
`source_id` fails validation by design.
