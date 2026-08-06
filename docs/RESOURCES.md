# Resources

Owner: `bob-the-boss`. This is the decision record for **where our poker
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
| `jl-6max-preflop-charts` | Visual 6-max cash preflop chart set, 6 pages. Page 3 is RFI (five 13×13 grids: Lojack, Hijack, Cutoff, Button, Small Blind); pages 4–6 cover facing an RFI in and out of position, and blind vs blind. "Implementable GTO" — a pure strategy with mixed frequencies rounded away. 100bb, 2.5bb opens, 3bb from SB. Free, no account. **Grids are images**; see RFI-CALIBRATION §5.0 for how to read them. | `https://jlsecrets.s3.amazonaws.com/advancedclasses/6maxcashgames/pdf/Online%206-max%20Cash%20Game%20Preflop%20Charts.pdf` | **PRIMARY for `rfi_6max_*`** | **2026-08-06** — HTTP 200, 1.9 MB, page 3 rendered and read by bob-the-boss |
| `gtowizard-free-study` | Configurable free Study matrix — fold/call/raise charts at chosen rake, stack, and sizing. Free tier is enough for preflop. | `https://gtowizard.com/` | **PRIMARY for `rfi_9max_*`**, cross-check for 6-max | not yet |
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
- **LLM-invented ranges.** A range that cannot cite a chart does not ship.
  Filling gaps by interpolating between charted neighbours is allowed, but must
  be recorded in the file's `notes`.

## 4. Adding a source

Add a row here with a new `source_id`, its URL, its role, and its verification
date. Then it can be referenced from range data. A range file citing an unknown
`source_id` fails validation by design.
