# Drill #2 — scoping note

Owner: `bob-the-boss`. Written at CP-03, immediately after v1 acceptance, while
the evidence is fresh. The whole premise of v1 was that drill #2 would be a
module rather than a rewrite. This records where that held and where it did not,
measured against what actually happened rather than what was intended.

## 1. What the platform made genuinely easy

**Adding a chart costs nothing but the chart.** Twelve range files shipped across
two formats, from two different publishers, with no code change per file. The
loader validates them, the sampler weights them, the grid renders them.

**A second non-fold action cost zero contract changes.** The 6-max small blind
turned out to raise *and* limp — discovered mid-build, after the API was frozen.
Because `actions` was a per-range list and grid cells were action→frequency maps
rather than a bare number, the SB simply carries `["raise", "limp"]`, the drill
offers three buttons instead of two, and the grid paints two colours. Nothing in
`api/`, `sessions/`, or the frontend's `DrillRunner` moved.

That is the single strongest evidence the abstraction was right, and it was very
nearly not taken: the obvious v1 design is `grid: {"AA": 1.0}`. Keep the map.

**Two publishers with contradictory strategies coexist.** The full-ring SB never
limps (74.1% pure raise-or-fold); the 6-max SB limps 38%. Both are correct, both
ship, and no code arbitrates between them — the data says what the data says.

**The declarative config schema paid for itself.** `config_schema()` is data, so
the frontend renders a form for options it has never heard of. When the format
enum changed, the *form* needed nothing.

**`prompt.kind` → component.** The frontend registry was exercised properly:
`DrillRunner`'s tests drive the session loop with a stub prompt component, not
the RFI one. That is the real proof of genericity — if the runner needed the RFI
UI to pass, it would not be generic.

## 2. What the platform made hard

**A new table format is code in eight places.** This is the big one, and I
overclaimed the opposite before checking. Switching 9-max → 8-max touched two
`Literal` types, two position tuples, a label map and the config schema on the
backend, plus `types.ts` and `POSITIONS_BY_FORMAT` on the frontend. Adding a
*chart* is free; adding a *format* is not.

**Fix before drill #2 if it introduces a format** (heads-up, MTT, 9-max if a
source appears): derive the format list and its positions from the data
directory at startup and serve them in `config_schema`, so the frontend learns
them over the wire like every other option. The position *labels* can live in
one place — the config schema — instead of being declared in two languages.

**Explanation copy is RFI-shaped.** `_explanation()` in `drills/rfi/drill.py`
talks about charts, adjacent grid cells and pure/mixed frequencies. A postflop
or pot-odds drill will not reuse a line of it. That is acceptable — copy is
drill-specific by nature — but do not plan on inheriting it, and note that it
took **three passes** to get right (BE-09, BE-10, and a nit left standing). The
lesson: generated prose needs a sweep *and* someone reading a few dozen
sentences. Both defects that survived BE-09 were grammatical in shape and wrong
in substance, so the regex sweep sailed past them.

**Mixed frequencies are unexercisable by shipped data.** Neither published
source has a single mixed cell — both are pure strategies. The whole
mixed-answer path (grading, `mixed: true`, the "acceptable, this is a close
spot" UI) is live code covered only by constructed fixtures. If drill #2 uses a
genuinely mixed source, that path gets its first real workout, and it has never
been seen by a user. Treat it as unproven, not as tested.

**The fixture/contract pair needs discipline.** `docs/examples/` made true
parallel work possible — the two services were built simultaneously and
integration was a config flip. But the illustrative CO fixture diverges from the
real chart in 20 of 169 cells, and I mis-stated that number twice, because a
*shape* comparison cannot see `0.5` versus `1.0`. If you keep the pattern, keep
the fixtures shape-only by construction: a fixture that carries plausible
*values* invites someone to compare them.

## 3. Recommended shape for drill #2

Do the format-derivation fix first **only if** drill #2 needs a new format.
Otherwise go straight at the drill.

The cheapest genuinely useful second drill is **defending the big blind versus a
raise**, because it reuses everything that already exists: the same 169-hand
grid, the same range file format (new `spot` directory, new action ids
`fold`/`call`/`3bet`), the same sampler, the same grading rule, the same
feedback UI. It needs one new prompt shape (`kind: "bb_defence"`, carrying the
raiser's position and size) and one new component. Its breakdown key is the
opponent's position rather than the hero's, which the summary and history
aggregation already handle generically — `aggregate()` was tested against a
fictional `bb_defence` drill with keys `vs_btn_open` / `vs_co_open` and returned
correct rollups with no changes.

The expensive second drill is anything postflop: it needs board texture, a new
prompt shape with community cards, equity computation, and a data source we do
not have. Do not start there.

## 4. Process notes worth carrying forward

- **The stop rule earned its keep.** `william-backend` halted four times rather
  than guess, and was right every time — the limping SB, `55` folding at UTG,
  `66` folding at full-ring UTG, and the login-gated source. Every one was a
  defect in my specification. Had he "helpfully" adjusted a range to satisfy a
  wrong invariant, we would have shipped bad poker data with a green suite.
- **Invariants written from the data you happen to have are descriptions.** The
  pairs invariant was wrong three times (`55`, `66`, `77`) before being replaced
  with a structural rule (pairs contiguous from `AA`) that cannot go stale.
- **Verify branches, do not trust reports.** DA-02 shipped perfect data on a
  branch whose test suite would not collect. Caught at merge because merging is
  gated on running the suite myself.
- **Read the output, not just the test names.** Two explanation defects were in
  100% and 25% of all generated copy and passed a defect-pattern sweep. They
  surfaced only by printing 480 sentences and reading them.
