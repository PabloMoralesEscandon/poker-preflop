/**
 * In-process implementation of {@link ApiClient} backed by the canonical
 * fixtures in `docs/examples/`. It exists so the whole app — config, drilling,
 * feedback, summary — is usable with the backend switched off.
 *
 * This is the ONLY module allowed to import from `docs/examples/`.
 *
 * What is served verbatim and what is generated
 * ---------------------------------------------
 * Static responses (`/drills`, `/ranges`, `/ranges/{id}`) come straight out of
 * the fixtures. Session responses cannot: a fixture replayed forever is not a
 * drill. So sessions are real state — a seeded question sequence, an index that
 * only advances on an answer, and grading against the fixture chart — while
 * matching the fixtures' shape exactly.
 *
 * Three honest limitations, all contained in this file:
 *
 *  1. `range_rfi_6max_CO.json` is the only chart that exists as a fixture, so
 *     every position is derived from it. Mock feedback is therefore shaped
 *     correctly and varies by hand, but it is NOT poker advice and the
 *     per-position differences a real chart set would show are absent.
 *  2. The small blind is a three-action spot (RFI-CALIBRATION §2.2), so the SB
 *     chart here is the CO chart with its offsuit opens mechanically relabelled
 *     `limp`. That is a shape, not a strategy — its only job is to exercise a
 *     multi-action range end to end before the real SB data is served.
 *  3. `weighting: "borderline"` is approximated (combo weight × 6 on mixed
 *     hands) rather than implementing the neighbour scan in
 *     RANGE-DATA-FORMAT §6. The real sampler is the backend's.
 *  4. `vs_3bet` deals only from the one chart that exists as a fixture, so its
 *     28 matchups all show `UTG vs BTN`'s cells and its opening range. The
 *     sizes do vary by matchup, because they are printed per grid rather than
 *     derived from the cells.
 */

import drillsFixture from '@fixtures/drills.json';
import rangeCoFixture from '@fixtures/range_rfi_6max_CO.json';
import rangePloBtnFixture from '@fixtures/range_rfi_plo_6max_BTN.json';
import rangeVsLimpFixture from '@fixtures/range_vs_limp_6max_BB_vs_SB.json';
import rangeVs3BetFixture from '@fixtures/range_vs_3bet_8max_UTG_vs_BTN.json';
import rangeVsRfiFixture from '@fixtures/range_vs_rfi_6max_BB_vs_BTN.json';
import sourcesFixture from '@fixtures/sources.json';

import { ApiError, type ApiClient } from './client';
import { FOLD_ACTION_ID, gradeCell } from './grading';
import {
  POSITIONS_BY_FORMAT,
  type ActionFrequencies,
  type AnswerRequest,
  type AnswerResponse,
  type BreakdownRow,
  type ConfigField,
  type CreateSessionRequest,
  type DealtHand,
  type DrillConfig,
  type DrillInfo,
  type DrillsResponse,
  type HealthResponse,
  type Mistake,
  type NextResponse,
  type Position,
  type Question,
  type QuestionPrompt,
  type RangeDetail,
  type RangeFilter,
  type RangeGrid,
  type RangeListItem,
  type RangeStats,
  type RangesResponse,
  type SourcesResponse,
  type SessionResponse,
  type SessionSummary,
  type TableFormat,
} from './types';
import { bbAmount } from '../lib/bb';
import {
  ALL_HANDS,
  cardsForNotation,
  combosOf,
  gridIndexOf,
  handTypeOf,
} from '../lib/hands';
import {
  PLO_CLASS_KEYS,
  TOTAL_PLO_COMBOS,
  classifyPloHand,
  ploCombos,
  ploDifficultyFactor,
  ploEffectiveCombos,
} from '../lib/hands-plo';

const DRILLS: DrillsResponse = drillsFixture as DrillsResponse;

/**
 * The matchups the `vs_rfi` drill offers, taken from the drills fixture rather
 * than declared here — the fixture is regenerated from the live server, so this
 * cannot drift from what the real config form will show.
 */
const VS_RFI_MATCHUPS: string[] = (() => {
  const drill = DRILLS.drills.find((entry) => entry.id === 'vs_rfi');
  const field = drill?.config_schema.fields.find(
    (entry) => entry.key === 'matchups'
  );
  if (field?.type !== 'multi_enum') return [];
  const options = field.options ?? field.options_by?.['6max'] ?? [];
  return options.map((option) => option.value);
})();

/**
 * Which matchups have no calling range.
 *
 * Read off the fourteen real files in `backend/data/ranges/vs_rfi/6max/` — the
 * mock cannot import them, but their *shape* is a fact worth copying so that a
 * two-button spot appears where a two-button spot really exists. Only the shape
 * is taken; every cell here still comes from the one illustrative fixture, and
 * every derived range is labelled `fixture-illustrative` so the chart browser
 * flags it. For anything that cares about values, use the live server.
 */
const RAISE_ACTION_ID = 'raise';
const LIMP_ACTION_ID = 'limp';

/**
 * `range_rfi_6max_CO.json` was not migrated when v2 replaced `open_size_bb`
 * with `action_sizes_bb` and made `stats.by_action` required — it is still v1
 * shaped, while the other range fixture is v2. `docs/` is read-only to me, so
 * the mock reads whichever form it finds. Delete the fallback once the fixture
 * is migrated.
 */
function normaliseRange(raw: unknown): RangeDetail {
  const range = raw as RangeDetail & { open_size_bb?: number };
  const sizes =
    range.action_sizes_bb ??
    (range.open_size_bb !== undefined
      ? { [RAISE_ACTION_ID]: range.open_size_bb }
      : {});
  return {
    ...range,
    vs_position: range.vs_position ?? null,
    facing_size_bb: range.facing_size_bb ?? null,
    action_sizes_bb: sizes,
    stats: range.stats.by_action
      ? range.stats
      : { ...range.stats, by_action: {} },
  };
}

const CO_RANGE = normaliseRange(rangeCoFixture);
const PLO_BTN_RANGE = normaliseRange(rangePloBtnFixture);
const PLO_GAME = 'plo' as const;
const VS_RFI_RANGE = normaliseRange(rangeVsRfiFixture);
const VS_LIMP_RANGE = normaliseRange(rangeVsLimpFixture);
const VS_3BET_RANGE = normaliseRange(rangeVs3BetFixture);
const SOURCES = sourcesFixture as unknown as SourcesResponse;

const THREE_BET_ONLY_MATCHUPS = new Set([
  'HJ_vs_UTG',
  'CO_vs_UTG',
  'CO_vs_HJ',
  'SB_vs_UTG',
  'SB_vs_HJ',
  'SB_vs_CO',
  'SB_vs_BTN',
]);

/** Ranges served verbatim from a fixture, keyed by id. */
const FIXTURE_RANGES: Record<string, RangeDetail> = {
  [VS_RFI_RANGE.range_id]: VS_RFI_RANGE,
  [VS_LIMP_RANGE.range_id]: VS_LIMP_RANGE,
  [PLO_BTN_RANGE.range_id]: PLO_BTN_RANGE,
  [VS_3BET_RANGE.range_id]: VS_3BET_RANGE,
};

/**
 * The one real PLO chart the mock has, reused for every seat exactly the way
 * the Hold'em side reuses the CO chart. Same caveat applies: shapes are real,
 * per-position differences are not.
 */
const PLO_GRID = PLO_BTN_RANGE.grid;

function ploChartFor(position: Position): MockChart {
  void position;
  const openSize = PLO_BTN_RANGE.action_sizes_bb[RAISE_ACTION_ID] ?? 3.5;
  return {
    actions: [RAISE_ACTION_ID],
    grid: PLO_GRID,
    actionSizesBb: { [RAISE_ACTION_ID]: openSize },
    actionLabels: {
      [RAISE_ACTION_ID]: `Raise ${formatBb(openSize)}bb`,
    },
  };
}

const PLO_UNIFORM_WEIGHTS = PLO_CLASS_KEYS.map((key) => ploCombos(key));
const PLO_BORDERLINE_WEIGHTS = PLO_CLASS_KEYS.map(
  (key) => ploCombos(key) * (ploDifficultyFactor(key, PLO_GRID) > 1 ? 6 : 1)
);

// ---------------------------------------------------------------------------
// Per-position charts, derived from the one fixture chart
// ---------------------------------------------------------------------------

/**
 * A chart the mock can both drill from and serve as a range.
 *
 * Deriving both from one place is what keeps the mock self-consistent: the
 * chart shown in the feedback panel is exactly the chart the answer was graded
 * against.
 */
interface MockChart {
  actions: string[];
  grid: RangeGrid;
  /** Action id → size in big blinds, replacing v1's single `open_size_bb`. */
  actionSizesBb: Record<string, number>;
  /** Label for each non-fold action, including its sizing. */
  actionLabels: Record<string, string>;
  /**
   * Whether fold is a legal action in this spot.
   *
   * It is not a property of the grid — a grid stores non-fold frequencies and
   * says nothing about legality — so it has to be declared. `vs_limp` is the
   * spot that forced this: hero is already in for free, fold is 0.0% across all
   * 1326 combos, and offering the button anyway would be offering a line the
   * chart never takes (RANGE-DATA-FORMAT §9).
   *
   * Defaults to `true` because it is true everywhere else.
   */
  offersFold?: boolean;
  /**
   * The order the buttons are offered in, when it differs from `actions`.
   *
   * `actions` is the chart's own list and doubles as the grading tie-break
   * order, so it follows the range file. What a player reads left to right is a
   * separate decision — passive first, matching `Fold, Call, 3-Bet` in the
   * fixtures — and conflating the two would let a UI choice change a grade.
   */
  offerOrder?: string[];
}

/** The number that goes inside a server-authored label such as `Raise 2.5bb`. */
const formatBb = bbAmount;

/**
 * The SB opens for 3bb and can also limp (RFI-CALIBRATION §2.2). Offsuit opens
 * become limps here purely so a two-non-fold-action range exists to render;
 * see the limitation note at the top of this file.
 */
function toSmallBlindGrid(grid: RangeGrid): RangeGrid {
  const derived: RangeGrid = {};
  for (const hand of ALL_HANDS) {
    const frequencies = grid[hand] ?? {};
    const raise = frequencies[RAISE_ACTION_ID];
    if (raise === undefined) {
      derived[hand] = {};
      continue;
    }
    derived[hand] =
      handTypeOf(hand) === 'offsuit'
        ? { [LIMP_ACTION_ID]: raise }
        : { [RAISE_ACTION_ID]: raise };
  }
  return derived;
}

const SB_GRID = toSmallBlindGrid(CO_RANGE.grid);

const CALL_ACTION_ID = 'call';
const THREE_BET_ACTION_ID = '3bet';

function threeBetOnlyGrid(grid: RangeGrid): RangeGrid {
  const derived: RangeGrid = {};
  for (const hand of ALL_HANDS) {
    const frequencies = grid[hand] ?? {};
    const threeBet = frequencies[THREE_BET_ACTION_ID];
    derived[hand] =
      threeBet === undefined ? {} : { [THREE_BET_ACTION_ID]: threeBet };
  }
  return derived;
}

const HJ_VS_UTG_GRID = threeBetOnlyGrid(VS_RFI_RANGE.grid);

/** Hero seat and raiser seat, parsed from the matchup key. */
function seatsOf(matchup: string): { hero: Position; raiser: Position } {
  const [hero, raiser] = matchup.split('_vs_');
  return {
    hero: (hero ?? 'BB') as Position,
    raiser: (raiser ?? 'BTN') as Position,
  };
}

function vsRfiChartFor(matchup: string): MockChart {
  const outOfPosition = matchup.startsWith('SB') || matchup.startsWith('BB');
  // VS-RFI-CALIBRATION §1.1: 3.5x in position, 4x out of position — and those
  // are multipliers of the open, not absolute big blinds. Facing 2.5bb that is
  // 8.75bb and 10bb. The earlier reading of "3.5bb / 4bb" made a 3-bet smaller
  // than the raise it answered; the document now calls that error out by name.
  const facing = VS_RFI_RANGE.facing_size_bb ?? 2.5;
  const threeBetSize = round(facing * (outOfPosition ? 4 : 3.5), 2);

  if (THREE_BET_ONLY_MATCHUPS.has(matchup)) {
    return {
      actions: [THREE_BET_ACTION_ID],
      grid: HJ_VS_UTG_GRID,
      actionSizesBb: { [THREE_BET_ACTION_ID]: threeBetSize },
      actionLabels: {
        [THREE_BET_ACTION_ID]: `3-Bet to ${formatBb(threeBetSize)}bb`,
      },
    };
  }
  return {
    actions: [THREE_BET_ACTION_ID, CALL_ACTION_ID],
    grid: VS_RFI_RANGE.grid,
    actionSizesBb: {
      [THREE_BET_ACTION_ID]: threeBetSize,
      [CALL_ACTION_ID]: facing,
    },
    actionLabels: {
      [THREE_BET_ACTION_ID]: `3-Bet to ${formatBb(threeBetSize)}bb`,
      [CALL_ACTION_ID]: `Call ${formatBb(facing)}bb`,
    },
    // `Fold, Call, 3-Bet` — cheapest first, as next_question_vs_rfi.json
    // offers them. The range's own `actions` puts 3-bet first and stays the
    // grading tie-break order.
    offerOrder: [CALL_ACTION_ID, THREE_BET_ACTION_ID],
  };
}

// ---------------------------------------------------------------------------
// Blind versus blind
// ---------------------------------------------------------------------------

const CHECK_ACTION_ID = 'check';

/** BVB-CALIBRATION §2: the SB's limp is 1bb and the BB raises 3.5x of it. */
const SB_LIMP_SIZE_BB = VS_LIMP_RANGE.facing_size_bb ?? 1;
/** RFI-CALIBRATION §2.2: the small blind opens for 3bb. */
const SB_OPEN_SIZE_BB = 3;

/**
 * Facing the limp. Served straight from the fixture, cells included — it is the
 * only chart in the mock that is not derived, and the only one with no folded
 * cells at all.
 *
 * `offersFold: false` is the whole point of the spot. Hero is in for free, so
 * fold is not a line the drill may offer.
 */
function vsLimpChart(): MockChart {
  const raiseSize = VS_LIMP_RANGE.action_sizes_bb[RAISE_ACTION_ID] ?? 3.5;
  return {
    actions: [...VS_LIMP_RANGE.actions],
    grid: VS_LIMP_RANGE.grid,
    actionSizesBb: { ...VS_LIMP_RANGE.action_sizes_bb },
    actionLabels: {
      [RAISE_ACTION_ID]: `Raise to ${formatBb(raiseSize)}bb`,
      // No sizing in the label, because there is no size. The fixture says
      // `check: 0.0`, and "Check 0bb" would be a lie dressed as precision.
      [CHECK_ACTION_ID]: 'Check',
    },
    offersFold: false,
    // Passive first, as `next_question_bvb_limp.json` offers them.
    offerOrder: [CHECK_ACTION_ID, RAISE_ACTION_ID],
  };
}

/**
 * Facing the SB's open. An ordinary facing-a-raise spot (VS-RFI-CALIBRATION §7),
 * so fold is back and the cells are the vs-RFI fixture's — illustrative, as the
 * limitation note at the top of this file says of every derived chart.
 *
 * The 3-bet is 3.5x of a 3bb open: the BB is in position postflop heads-up.
 */
function bvbRaiseChart(): MockChart {
  const threeBetSize = round(SB_OPEN_SIZE_BB * 3.5, 2);
  return {
    actions: [THREE_BET_ACTION_ID, CALL_ACTION_ID],
    grid: VS_RFI_RANGE.grid,
    actionSizesBb: {
      [THREE_BET_ACTION_ID]: threeBetSize,
      [CALL_ACTION_ID]: SB_OPEN_SIZE_BB,
    },
    actionLabels: {
      [THREE_BET_ACTION_ID]: `3-Bet to ${formatBb(threeBetSize)}bb`,
      [CALL_ACTION_ID]: `Call ${formatBb(SB_OPEN_SIZE_BB)}bb`,
    },
    offerOrder: [CALL_ACTION_ID, THREE_BET_ACTION_ID],
  };
}

// ---------------------------------------------------------------------------
// Facing a 3-bet
// ---------------------------------------------------------------------------

const FOUR_BET_ACTION_ID = '4bet';
const ALL_IN_ACTION_ID = 'allin';

/**
 * Sizes are read off the guide rather than derived: it opens 3bb, 3-bets to
 * 10bb in position and 12bb from a blind, and 4-bets to 24bb and 27bb
 * respectively (VS-3BET-CALIBRATION §3). Every one is printed on its own grid,
 * so there is no multiplier to get wrong here — the mistake VS-RFI-CALIBRATION
 * §1.1 records is not available in this spot.
 */
function vs3BetSizes(villain: Position): {
  open: number;
  facing: number;
  fourBet: number;
} {
  const fromBlind = villain === 'SB' || villain === 'BB';
  return {
    open: VS_3BET_RANGE.hero_committed_bb ?? 3,
    facing: fromBlind ? 12 : 10,
    fourBet: fromBlind ? 27 : 24,
  };
}

/**
 * Every matchup renders the one real vs-3bet fixture, the same way every RFI
 * seat renders the CO chart — shapes are real, per-matchup differences are not.
 * Its cells and its `reach` are the published `UTG vs BTN` chart, so the mock
 * deals only hands hero actually opens, which is the property that makes this
 * spot make sense at all.
 */
function vs3BetChartFor(matchup: string): MockChart {
  const { hero, raiser } = seatsOf(matchup);
  void hero;
  const sizes = vs3BetSizes(raiser);
  return {
    actions: [...VS_3BET_RANGE.actions],
    grid: VS_3BET_RANGE.grid,
    // Only the actions the chart actually declares: the fixture matchup has no
    // shove cell, and a size for an action nobody is offered is a size that
    // cannot be checked against anything.
    actionSizesBb: Object.fromEntries(
      (
        [
          [CALL_ACTION_ID, sizes.facing],
          [FOUR_BET_ACTION_ID, sizes.fourBet],
          [ALL_IN_ACTION_ID, VS_3BET_RANGE.stack_bb],
        ] as const
      ).filter(([id]) => VS_3BET_RANGE.actions.includes(id))
    ),
    actionLabels: {
      [CALL_ACTION_ID]: `Call ${formatBb(sizes.facing)}bb`,
      [FOUR_BET_ACTION_ID]: `4-Bet to ${formatBb(sizes.fourBet)}bb`,
      [ALL_IN_ACTION_ID]: `All-in ${formatBb(VS_3BET_RANGE.stack_bb)}bb`,
    },
    // Cheapest first, matching next_question_vs_3bet.json.
    offerOrder: [CALL_ACTION_ID, FOUR_BET_ACTION_ID, ALL_IN_ACTION_ID].filter(
      (id) => VS_3BET_RANGE.actions.includes(id)
    ),
  };
}

/**
 * The matchups the `vs_3bet` drill offers, taken from the drills fixture for
 * the same reason {@link VS_RFI_MATCHUPS} is.
 */
const VS_3BET_MATCHUPS: string[] = (() => {
  const drill = DRILLS.drills.find((entry) => entry.id === 'vs_3bet');
  const field = drill?.config_schema.fields.find(
    (entry) => entry.key === 'matchups'
  );
  if (field?.type !== 'multi_enum') return [];
  const options = field.options ?? field.options_by?.['8max'] ?? [];
  return options.map((option) => option.value);
})();

function bvbChartFor(sbAction: 'limp' | 'raise'): MockChart {
  return sbAction === 'limp' ? vsLimpChart() : bvbRaiseChart();
}

/**
 * The chart behind a catalogue entry.
 *
 * One function so the list and the detail cannot disagree: `BB vs SB` is a
 * `vs_rfi` matchup whose sizes come from a 3bb open rather than the 2.5bb the
 * other thirteen face, and deriving it twice is exactly how that drifts.
 */
function chartForListed(entry: RangeListItem): MockChart {
  if (entry.game === 'plo') return ploChartFor(entry.position);
  if (entry.spot === 'vs_limp') return vsLimpChart();
  if (entry.spot === 'vs_3bet') {
    return vs3BetChartFor(`${entry.position}_vs_${entry.vs_position ?? 'BTN'}`);
  }
  if (entry.spot !== 'vs_rfi') return chartFor(entry.position);
  const matchup = `${entry.position}_vs_${entry.vs_position ?? 'BTN'}`;
  return matchup === 'BB_vs_SB' ? bvbRaiseChart() : vsRfiChartFor(matchup);
}

/** The chart a question was generated from, and is graded against. */
function chartForPrompt(prompt: QuestionPrompt): MockChart {
  if (prompt.kind === 'bvb') {
    return bvbChartFor(prompt.sb_action);
  }
  if (prompt.kind === 'vs_rfi') {
    return vsRfiChartFor(
      `${prompt.hero_position}_vs_${prompt.raiser_position}`
    );
  }
  if (prompt.kind === 'vs_3bet') {
    return vs3BetChartFor(
      `${prompt.hero_position}_vs_${prompt.three_bettor_position}`
    );
  }
  if (prompt.game === 'plo') return ploChartFor(prompt.hero_position);
  return chartFor(prompt.hero_position);
}

function rangeIdForPrompt(prompt: QuestionPrompt): string {
  if (prompt.kind === 'bvb') {
    // The two branches are two different spots, so they are two different
    // charts — the limp branch is the only one that lives under `vs_limp`.
    const spot = prompt.sb_action === 'limp' ? 'vs_limp' : 'vs_rfi';
    return `${spot}_${prompt.table_format}_${prompt.hero_position}_vs_${prompt.vs_position}`;
  }
  if (prompt.kind === 'vs_3bet') {
    return `vs_3bet_${prompt.table_format}_${prompt.hero_position}_vs_${prompt.three_bettor_position}`;
  }
  if (prompt.kind !== 'vs_rfi') {
    const game = prompt.game === 'plo' ? 'plo' : undefined;
    return game === undefined
      ? `rfi_${prompt.table_format}_${prompt.hero_position}`
      : `rfi_${game}_${prompt.table_format}_${prompt.hero_position}`;
  }
  return `vs_rfi_${prompt.table_format}_${prompt.hero_position}_vs_${prompt.raiser_position}`;
}

function chartFor(position: Position): MockChart {
  if (position === 'SB') {
    return {
      actions: [RAISE_ACTION_ID, LIMP_ACTION_ID],
      grid: SB_GRID,
      actionSizesBb: { [RAISE_ACTION_ID]: 3, [LIMP_ACTION_ID]: 1 },
      actionLabels: {
        [RAISE_ACTION_ID]: 'Raise 3bb',
        [LIMP_ACTION_ID]: 'Limp 1bb',
      },
    };
  }
  const openSize = CO_RANGE.action_sizes_bb[RAISE_ACTION_ID] ?? 2.5;
  return {
    actions: [RAISE_ACTION_ID],
    grid: CO_RANGE.grid,
    actionSizesBb: { [RAISE_ACTION_ID]: openSize },
    actionLabels: {
      [RAISE_ACTION_ID]: `Raise ${formatBb(openSize)}bb`,
    },
  };
}

/**
 * RANGE-DATA-FORMAT §4: combo-weighted stats over the 1326 starting combos.
 *
 * `reach` narrows the denominator, and only `vs_3bet` passes one: its charts
 * are of hero's opening range, not of the deal.
 */
function statsFor(
  grid: RangeGrid,
  reach?: readonly string[] | null
): RangeStats {
  let combos = 0;
  let handsPlayed = 0;
  const byAction: Record<string, number> = {};
  for (const hand of ALL_HANDS) {
    const frequencies = grid[hand] ?? {};
    const played = Object.values(frequencies).reduce(
      (sum, value) => sum + value,
      0
    );
    if (played > 0) handsPlayed += 1;
    combos += played * combosOf(hand);
    for (const [actionId, frequency] of Object.entries(frequencies)) {
      byAction[actionId] =
        (byAction[actionId] ?? 0) + frequency * combosOf(hand);
    }
  }
  for (const actionId of Object.keys(byAction)) {
    byAction[actionId] = Math.round((byAction[actionId] ?? 0) * 100) / 100;
  }
  return {
    combos: Math.round(combos * 100) / 100,
    vpip: Math.round((combos / 1326) * 10000) / 10000,
    hands_played: handsPlayed,
    by_action: byAction,
    reach_combos:
      reach == null
        ? 1326
        : reach.reduce((sum, hand) => sum + combosOf(hand), 0),
  };
}

/** Stats over class keys, weighted like the backend's effective combos. */
function statsForPlo(grid: RangeGrid): RangeStats {
  let combos = 0;
  let handsPlayed = 0;
  const byAction: Record<string, number> = {};
  for (const key of PLO_CLASS_KEYS) {
    const frequencies = grid[key] ?? {};
    const played = Object.values(frequencies).reduce(
      (sum, value) => sum + value,
      0
    );
    if (played > 0) handsPlayed += 1;
    const weight = ploEffectiveCombos(key);
    combos += played * weight;
    for (const [actionId, frequency] of Object.entries(frequencies)) {
      byAction[actionId] = (byAction[actionId] ?? 0) + frequency * weight;
    }
  }
  for (const actionId of Object.keys(byAction)) {
    byAction[actionId] = Math.round((byAction[actionId] ?? 0) * 100) / 100;
  }
  return {
    combos: Math.round(combos * 100) / 100,
    vpip: Math.round((combos / TOTAL_PLO_COMBOS) * 10000) / 10000,
    hands_played: handsPlayed,
    by_action: byAction,
    reach_combos: TOTAL_PLO_COMBOS,
  };
}

/**
 * Every range the mock will serve, in the enriched v2 list shape.
 *
 * Two fixture-backed entries carry their real provenance; the remaining RFI
 * positions are derived from the CO chart and say so through the
 * `fixture-illustrative` source id, so the browser shows them as what they are.
 */
function catalogue(): RangeListItem[] {
  const derived = (['UTG', 'HJ', 'CO', 'BTN', 'SB'] as const).map(
    (position) => {
      const chart = chartFor(position);
      return {
        range_id: `rfi_6max_${position}`,
        spot: 'rfi',
        table_format: '6max' as const,
        position,
        vs_position: null,
        stack_bb: CO_RANGE.stack_bb,
        actions: [...chart.actions],
        action_sizes_bb: { ...chart.actionSizesBb },
        facing_size_bb: null,
        source_id: 'fixture-illustrative',
        stats: statsFor(chart.grid),
      } satisfies RangeListItem;
    }
  );

  const matchups = VS_RFI_MATCHUPS.filter(
    // Supplied by `blindVsBlind` below, whose sizes come from a 3bb open. The
    // drills fixture started naming it once it was regenerated; listing it
    // from both places would put the same chart in the catalogue twice.
    (matchup) => matchup !== 'BB_vs_SB'
  ).map((matchup) => {
    const chart = vsRfiChartFor(matchup);
    const { hero, raiser } = seatsOf(matchup);
    return {
      range_id: `vs_rfi_6max_${matchup}`,
      spot: 'vs_rfi',
      table_format: '6max' as const,
      position: hero,
      vs_position: raiser,
      stack_bb: VS_RFI_RANGE.stack_bb,
      actions: [...chart.actions],
      action_sizes_bb: { ...chart.actionSizesBb },
      facing_size_bb: VS_RFI_RANGE.facing_size_bb,
      source_id:
        matchup === 'BB_vs_BTN'
          ? VS_RFI_RANGE.source_id
          : 'fixture-illustrative',
      stats: statsFor(chart.grid),
    } satisfies RangeListItem;
  });

  /**
   * Blind versus blind adds two charts, one per branch, and they land in two
   * different spots: the limp branch is `vs_limp`, the raise branch is an
   * ordinary `vs_rfi` matchup that the drills fixture's list happens not to
   * name (VS-RFI-CALIBRATION §7 — it was added to that spot later).
   */
  const threeBet = VS_3BET_MATCHUPS.map((matchup) => {
    const chart = vs3BetChartFor(matchup);
    const { hero, raiser } = seatsOf(matchup);
    return {
      range_id: `vs_3bet_8max_${matchup}`,
      spot: 'vs_3bet',
      table_format: '8max' as const,
      position: hero,
      vs_position: raiser,
      stack_bb: VS_3BET_RANGE.stack_bb,
      actions: [...chart.actions],
      action_sizes_bb: { ...chart.actionSizesBb },
      facing_size_bb: vs3BetSizes(raiser).facing,
      source_id:
        matchup === 'UTG_vs_BTN'
          ? VS_3BET_RANGE.source_id
          : 'fixture-illustrative',
      stats: statsFor(chart.grid, VS_3BET_RANGE.reach),
    } satisfies RangeListItem;
  });

  const bvbRaise = bvbRaiseChart();
  const blindVsBlind: RangeListItem[] = [
    {
      range_id: 'vs_rfi_6max_BB_vs_SB',
      spot: 'vs_rfi',
      table_format: '6max',
      position: 'BB',
      vs_position: 'SB',
      stack_bb: VS_RFI_RANGE.stack_bb,
      actions: [...bvbRaise.actions],
      action_sizes_bb: { ...bvbRaise.actionSizesBb },
      facing_size_bb: SB_OPEN_SIZE_BB,
      source_id: 'fixture-illustrative',
      stats: statsFor(bvbRaise.grid),
    },
    {
      range_id: VS_LIMP_RANGE.range_id,
      spot: VS_LIMP_RANGE.spot,
      table_format: VS_LIMP_RANGE.table_format,
      position: VS_LIMP_RANGE.position,
      vs_position: VS_LIMP_RANGE.vs_position,
      stack_bb: VS_LIMP_RANGE.stack_bb,
      actions: [...VS_LIMP_RANGE.actions],
      action_sizes_bb: { ...VS_LIMP_RANGE.action_sizes_bb },
      facing_size_bb: VS_LIMP_RANGE.facing_size_bb,
      source_id: VS_LIMP_RANGE.source_id,
      stats: VS_LIMP_RANGE.stats,
    },
  ];

  const ploEntries: RangeListItem[] = (
    ['UTG', 'HJ', 'CO', 'BTN', 'SB'] as const
  ).map((position) => {
    const chart = ploChartFor(position);
    return {
      range_id: `rfi_plo_6max_${position}`,
      spot: 'rfi',
      game: PLO_GAME,
      table_format: '6max' as const,
      position,
      vs_position: null,
      stack_bb: PLO_BTN_RANGE.stack_bb,
      actions: [...chart.actions],
      action_sizes_bb: { ...chart.actionSizesBb },
      facing_size_bb: null,
      source_id:
        position === 'BTN' ? PLO_BTN_RANGE.source_id : 'fixture-illustrative',
      // BTN is served verbatim from the fixture, so its stats must be the
      // fixture's own numbers rather than a recomputation of them.
      stats: position === 'BTN' ? PLO_BTN_RANGE.stats : statsForPlo(chart.grid),
    } satisfies RangeListItem;
  });

  return [
    ...derived,
    ...matchups.filter((entry) => entry.range_id !== VS_RFI_RANGE.range_id),
    ...blindVsBlind,
    ...ploEntries,
    // The fixture-backed matchup keeps the fixture's own stats, exactly as the
    // PLO button and the vs-RFI matchup do.
    ...threeBet.map((entry) =>
      entry.range_id === VS_3BET_RANGE.range_id
        ? { ...entry, stats: VS_3BET_RANGE.stats }
        : entry
    ),
    {
      range_id: VS_RFI_RANGE.range_id,
      spot: VS_RFI_RANGE.spot,
      table_format: VS_RFI_RANGE.table_format,
      position: VS_RFI_RANGE.position,
      vs_position: VS_RFI_RANGE.vs_position,
      stack_bb: VS_RFI_RANGE.stack_bb,
      actions: [...VS_RFI_RANGE.actions],
      action_sizes_bb: { ...VS_RFI_RANGE.action_sizes_bb },
      facing_size_bb: VS_RFI_RANGE.facing_size_bb,
      source_id: VS_RFI_RANGE.source_id,
      stats: VS_RFI_RANGE.stats,
    },
  ];
}

// ---------------------------------------------------------------------------
// Seeded randomness — a session replays identically for a given seed.
// ---------------------------------------------------------------------------

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Rng {
  next(): number;
  pick(bound: number): number;
  weighted(weights: readonly number[]): number;
}

function makeRng(seed: number): Rng {
  const next = mulberry32(seed);
  return {
    next,
    pick: (bound) => Math.floor(next() * bound) % Math.max(bound, 1),
    weighted(weights) {
      const total = weights.reduce((sum, weight) => sum + weight, 0);
      let target = next() * total;
      for (let i = 0; i < weights.length; i += 1) {
        target -= weights[i] ?? 0;
        if (target <= 0) return i;
      }
      return weights.length - 1;
    },
  };
}

// ---------------------------------------------------------------------------
// Session state
// ---------------------------------------------------------------------------

interface AnsweredQuestion {
  question: Question;
  chosenActionId: string;
  expectedActionId: string;
  correct: boolean;
}

interface MockSession {
  id: string;
  drillId: string;
  config: DrillConfig;
  seed: number;
  createdAt: string;
  rng: Rng;
  answered: AnsweredQuestion[];
  /** The current unanswered question. `next` is idempotent because of this. */
  pending: Question | null;
}

export class MockApiClient implements ApiClient {
  private readonly sessions = new Map<string, MockSession>();
  private sessionCounter = 0;

  async getHealth(): Promise<HealthResponse> {
    return { status: 'ok', version: '0.1.0-mock' };
  }

  async listDrills(): Promise<DrillsResponse> {
    return clone(DRILLS);
  }

  async createSession(request: CreateSessionRequest): Promise<SessionResponse> {
    const drill = DRILLS.drills.find((entry) => entry.id === request.drill_id);
    if (!drill) {
      throw new ApiError(
        'drill_not_found',
        `Unknown drill id ${request.drill_id}.`,
        404
      );
    }

    const config = validateConfig(drill, request.config ?? {});
    const seed = request.seed ?? Math.floor(Math.random() * 2 ** 31);

    this.sessionCounter += 1;
    const id = `s_mock_${String(this.sessionCounter).padStart(4, '0')}`;
    this.sessions.set(id, {
      id,
      drillId: drill.id,
      config,
      seed,
      createdAt: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
      rng: makeRng(seed),
      answered: [],
      pending: null,
    });

    return {
      session_id: id,
      drill_id: drill.id,
      config: clone(config),
      seed,
      created_at: this.mustGet(id).createdAt,
    };
  }

  async getNextQuestion(sessionId: string): Promise<NextResponse> {
    const session = this.mustGet(sessionId);
    const total = questionCount(session.config);

    if (session.answered.length >= total) {
      return { done: true, question: null };
    }
    // Idempotent: the same question, with the same cards, until it is answered.
    session.pending ??= generateQuestion(session, total);
    return { done: false, question: clone(session.pending) };
  }

  async submitAnswer(
    sessionId: string,
    request: AnswerRequest
  ): Promise<AnswerResponse> {
    const session = this.mustGet(sessionId);
    const total = questionCount(session.config);

    const alreadyAnswered = session.answered.some(
      (entry) => entry.question.question_id === request.question_id
    );
    if (alreadyAnswered) {
      throw new ApiError(
        'question_already_answered',
        `${request.question_id} has already been answered.`,
        409
      );
    }

    if (session.answered.length >= total) {
      throw new ApiError(
        'question_out_of_order',
        `${request.question_id} is not the current question.`,
        409
      );
    }

    session.pending ??= generateQuestion(session, total);
    const question = session.pending;
    if (question.question_id !== request.question_id) {
      throw new ApiError(
        'question_out_of_order',
        `${request.question_id} is not the current question.`,
        409
      );
    }

    const chosen = question.actions.find(
      (action) => action.id === request.action_id
    );
    if (!chosen) {
      throw new ApiError(
        'invalid_request',
        `${request.action_id} is not an available action.`,
        400,
        'action_id'
      );
    }

    const graded = grade(question, chosen.id);
    session.answered.push({
      question,
      chosenActionId: chosen.id,
      expectedActionId: graded.expected.action_id,
      correct: graded.correct,
    });
    session.pending = null;

    return {
      ...graded,
      progress: {
        answered: session.answered.length,
        correct: session.answered.filter((entry) => entry.correct).length,
        total,
      },
    };
  }

  async getSummary(sessionId: string): Promise<SessionSummary> {
    const session = this.mustGet(sessionId);
    const total = questionCount(session.config);
    const answered = session.answered.length;
    const correct = session.answered.filter((entry) => entry.correct).length;

    return {
      session_id: session.id,
      drill_id: session.drillId,
      answered,
      correct,
      accuracy: answered === 0 ? 0 : round(correct / answered, 4),
      complete: answered >= total,
      breakdown: buildBreakdown(session),
      mistakes: buildMistakes(session),
    };
  }

  async getSources(): Promise<SourcesResponse> {
    return clone(SOURCES);
  }

  async listRanges(filter?: RangeFilter): Promise<RangesResponse> {
    const ranges = catalogue().filter(
      (entry) =>
        (filter?.spot === undefined || entry.spot === filter.spot) &&
        (filter?.game === undefined || entry.game === filter.game) &&
        (filter?.table_format === undefined ||
          entry.table_format === filter.table_format) &&
        (filter?.position === undefined ||
          entry.position === filter.position) &&
        (filter?.vs_position === undefined ||
          entry.vs_position === filter.vs_position)
    );
    return { ranges: clone(ranges) };
  }

  async getRange(rangeId: string): Promise<RangeDetail> {
    const listed = catalogue().find((entry) => entry.range_id === rangeId);
    if (!listed) {
      throw new ApiError(
        'range_not_found',
        `Unknown range id ${rangeId}.`,
        404
      );
    }

    // Ranges that exist as a fixture are served verbatim — the chart browser is
    // an audit tool, so it must show the file, not a reconstruction of it.
    const fixture = FIXTURE_RANGES[rangeId];
    if (fixture) return clone(fixture);

    // The rest are derived from the CO chart, because no other RFI chart exists
    // as a fixture. Serving exactly what `grade` used keeps the mock
    // self-consistent: the chart in the feedback panel is the chart the answer
    // was graded against. It is illustrative data, not a real chart.
    const chart = chartForListed(listed);
    const base =
      listed.game === 'plo'
        ? PLO_BTN_RANGE
        : listed.spot === 'vs_rfi'
          ? VS_RFI_RANGE
          : CO_RANGE;
    return {
      ...clone(base),
      range_id: listed.range_id,
      spot: listed.spot,
      position: listed.position,
      vs_position: listed.vs_position,
      table_format: listed.table_format,
      source_id: listed.source_id,
      action_sizes_bb: { ...chart.actionSizesBb },
      facing_size_bb: listed.facing_size_bb,
      actions: [...chart.actions],
      grid: clone(chart.grid),
      stats:
        listed.game === 'plo' ? statsForPlo(chart.grid) : statsFor(chart.grid),
    };
  }

  private mustGet(sessionId: string): MockSession {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new ApiError('session_not_found', 'Unknown session id.', 404);
    }
    return session;
  }
}

// ---------------------------------------------------------------------------
// Config validation (API-CONTRACT §3 field types)
// ---------------------------------------------------------------------------

function validateConfig(drill: DrillInfo, raw: DrillConfig): DrillConfig {
  const config: DrillConfig = {};

  for (const field of drill.config_schema.fields) {
    const value = raw[field.key];
    config[field.key] =
      value === undefined ? field.default : checkField(field, value, config);
  }

  return config;
}

function checkField(
  field: ConfigField,
  value: unknown,
  soFar: DrillConfig
): DrillConfig[string] {
  const invalid = (message: string) =>
    new ApiError('invalid_config', message, 400, field.key);

  switch (field.type) {
    case 'enum': {
      const allowed = field.options.map((option) => option.value);
      if (typeof value !== 'string' || !allowed.includes(value)) {
        throw invalid(`${field.key} must be one of ${allowed.join(', ')}.`);
      }
      return value;
    }
    case 'multi_enum': {
      if (!Array.isArray(value) || value.length === 0) {
        throw invalid(`${field.key} must be non-empty.`);
      }
      const options =
        field.options ??
        field.options_by?.[String(soFar[field.depends_on ?? ''] ?? '')] ??
        [];
      const allowed = options.map((option) => option.value);
      for (const entry of value) {
        if (typeof entry !== 'string' || !allowed.includes(entry)) {
          throw invalid(`${entry} is not a valid ${field.key} value.`);
        }
      }
      return value as string[];
    }
    case 'int': {
      if (
        typeof value !== 'number' ||
        !Number.isInteger(value) ||
        value < field.min ||
        value > field.max
      ) {
        throw invalid(
          `${field.key} must be an integer between ${field.min} and ${field.max}.`
        );
      }
      return value;
    }
    case 'bool': {
      if (typeof value !== 'boolean') {
        throw invalid(`${field.key} must be a boolean.`);
      }
      return value;
    }
  }
}

function questionCount(config: DrillConfig): number {
  const value = config['question_count'];
  return typeof value === 'number' ? value : 25;
}

function tableFormat(config: DrillConfig): TableFormat {
  return config['table_format'] === '8max' ? '8max' : '6max';
}

function configuredPositions(config: DrillConfig): Position[] {
  const value = config['positions'];
  const positions = Array.isArray(value) ? (value as Position[]) : [];
  return positions.length > 0 ? positions : ['CO'];
}

// ---------------------------------------------------------------------------
// Question generation
// ---------------------------------------------------------------------------

/** Hand weights, computed once because the charts never change. */
const UNIFORM_WEIGHTS = ALL_HANDS.map((hand) => combosOf(hand));
const BORDERLINE_WEIGHTS = ALL_HANDS.map((hand) => {
  const played = playedFrequency(CO_RANGE.grid[hand] ?? {});
  return combosOf(hand) * (played > 0 && played < 1 ? 6 : 1);
});

/**
 * Facing a 3-bet deals only from the chart's `reach` — the hands hero actually
 * opened. Anything else is not a hard question in this spot, it is not a
 * question at all: hero folded it before the 3-bet existed.
 */
const VS_3BET_HANDS: string[] = VS_3BET_RANGE.reach ?? [...ALL_HANDS];
const VS_3BET_UNIFORM_WEIGHTS = VS_3BET_HANDS.map((hand) => combosOf(hand));
const VS_3BET_BORDERLINE_WEIGHTS = VS_3BET_HANDS.map((hand) => {
  const played = playedFrequency(VS_3BET_RANGE.grid[hand] ?? {});
  return combosOf(hand) * (played > 0 && played < 1 ? 6 : 1);
});

/** Total non-fold frequency. Fold frequency is `1 - played` and never stored. */
function playedFrequency(frequencies: ActionFrequencies): number {
  return Object.values(frequencies).reduce((sum, value) => sum + value, 0);
}

function generateQuestion(session: MockSession, total: number): Question {
  const format = tableFormat(session.config);
  const isPlo = session.drillId === 'rfi' && session.config['game'] === 'plo';
  const isVs3Bet = session.drillId === 'vs_3bet';
  const uniform = session.config['weighting'] === 'uniform';
  const hand = isPlo
    ? dealPloHand(session)
    : (() => {
        const pool = isVs3Bet ? VS_3BET_HANDS : ALL_HANDS;
        const weights = isVs3Bet
          ? uniform
            ? VS_3BET_UNIFORM_WEIGHTS
            : VS_3BET_BORDERLINE_WEIGHTS
          : uniform
            ? UNIFORM_WEIGHTS
            : BORDERLINE_WEIGHTS;
        const notation = pool[session.rng.weighted(weights)] ?? 'AA';
        const cards = cardsForNotation(notation, (bound) =>
          session.rng.pick(bound)
        );
        return { cards, notation };
      })();
  const index = session.answered.length + 1;

  const prompt = isPlo
    ? rfiPrompt(session, format, hand)
    : isVs3Bet
      ? vs3BetPrompt(session, hand)
      : session.drillId === 'bvb'
        ? bvbPrompt(session, format, hand)
        : session.drillId === 'vs_rfi'
          ? vsRfiPrompt(session, format, hand)
          : rfiPrompt(session, format, hand);

  const chart = chartForPrompt(prompt);
  // Fold is prepended only where folding is legal. It is not on the limp branch
  // of blind versus blind: hero is already in for free, the chart folds 0% of
  // 1326 combos, and a button for a line that is never right is not a choice.
  const offered = (chart.offerOrder ?? chart.actions).map((id) => ({
    id,
    label: chart.actionLabels[id] ?? id,
  }));
  return {
    question_id: `q_${index}`,
    index,
    total,
    drill_id: session.drillId,
    prompt,
    actions:
      chart.offersFold === false
        ? offered
        : [{ id: FOLD_ACTION_ID, label: 'Fold' }, ...offered],
  };
}

/** Class-key weighted pick, then a uniform concrete deal inside it. */
function dealPloHand(session: MockSession): DealtHand {
  const weights =
    session.config['weighting'] === 'uniform'
      ? PLO_UNIFORM_WEIGHTS
      : PLO_BORDERLINE_WEIGHTS;
  const notation = PLO_CLASS_KEYS[session.rng.weighted(weights)] ?? 'AA.ds';
  const hands = ploClassHands().get(notation) ?? [];
  const picked = hands[session.rng.pick(hands.length)];
  return {
    cards: (picked ?? []).map(
      (index) =>
        'AKQJT98765432'.charAt(Math.floor(index / 4)) + 'shdc'.charAt(index % 4)
    ),
    notation,
  };
}

/**
 * Every concrete four-card hand grouped by class key, built at most once.
 * Mirrors the backend's `_class_hands` cache so both sides deal identically.
 */
let PLO_CLASS_HANDS: Map<string, number[][]> | null = null;
function ploClassHands(): Map<string, number[][]> {
  if (PLO_CLASS_HANDS === null) {
    const map = new Map<string, number[][]>(
      PLO_CLASS_KEYS.map((key) => [key, []])
    );
    for (let a = 0; a < 49; a += 1) {
      for (let b = a + 1; b < 50; b += 1) {
        for (let c = b + 1; c < 51; c += 1) {
          for (let d = c + 1; d < 52; d += 1) {
            const indices: number[] = [a, b, c, d];
            const cards = indices.map(
              (index) =>
                'AKQJT98765432'.charAt(Math.floor(index / 4)) +
                'shdc'.charAt(index % 4)
            );
            map.get(classifyPloHand(cards))?.push(indices);
          }
        }
      }
    }
    PLO_CLASS_HANDS = map;
  }
  return PLO_CLASS_HANDS;
}

function rfiPrompt(
  session: MockSession,
  format: TableFormat,
  hand: DealtHand
): QuestionPrompt {
  const positions = configuredPositions(session.config);
  const heroPosition =
    positions[session.rng.pick(positions.length)] ?? ('CO' as Position);
  const game = session.config['game'] === 'plo' ? 'plo' : 'holdem';
  return {
    kind: 'rfi',
    ...(game === 'plo' ? { game: PLO_GAME } : {}),
    table_format: format,
    hero_position: heroPosition,
    stack_bb: CO_RANGE.stack_bb,
    hand,
    folded_before: seatsBefore(format, heroPosition),
    pot_bb: 1.5,
  };
}

/**
 * Pot and to-call are computed here because the server computes them: the
 * frontend is contractually forbidden from doing poker arithmetic (v2 §10).
 * Hero posts a blind, so what they still owe is less than the raise.
 */
function vsRfiPrompt(
  session: MockSession,
  format: TableFormat,
  hand: DealtHand
): QuestionPrompt {
  const matchups = configuredMatchups(session.config);
  const matchup = matchups[session.rng.pick(matchups.length)] ?? 'BB_vs_BTN';
  const { hero, raiser } = seatsOf(matchup);
  const facing = VS_RFI_RANGE.facing_size_bb ?? 2.5;
  const posted = hero === 'BB' ? 1 : hero === 'SB' ? 0.5 : 0;
  const blinds = 1.5;

  return {
    kind: 'vs_rfi',
    table_format: format,
    hero_position: hero,
    raiser_position: raiser,
    stack_bb: CO_RANGE.stack_bb,
    hand,
    // Everyone before the raiser folded — the raiser was first into the pot.
    // Matches next_question_vs_rfi.json, where BB vs BTN lists UTG, HJ and CO
    // and does not list the SB, who has not acted yet.
    folded_before: seatsBefore(format, raiser),
    facing_size_bb: facing,
    pot_bb: round(blinds + facing, 2),
    to_call_bb: round(facing - posted, 2),
  };
}

/**
 * Blind versus blind. Hero is always the big blind; the branch is what varies,
 * and it is drawn per hand so a session mixes limps and raises.
 *
 * The arithmetic matches `next_question_bvb_limp.json`: after a 1bb limp the
 * pot is 2bb and there is nothing to call, because hero's big blind is already
 * in. After a 3bb open the pot is 4bb and hero owes 2bb, having posted one.
 */
function bvbPrompt(
  session: MockSession,
  format: TableFormat,
  hand: DealtHand
): QuestionPrompt {
  const branches = configuredSituations(session.config);
  const sbAction = branches[session.rng.pick(branches.length)] ?? 'limp';
  const facing = sbAction === 'limp' ? SB_LIMP_SIZE_BB : SB_OPEN_SIZE_BB;

  return {
    kind: 'bvb',
    table_format: format,
    hero_position: 'BB',
    vs_position: 'SB',
    sb_action: sbAction,
    stack_bb: VS_LIMP_RANGE.stack_bb,
    hand,
    facing_size_bb: facing,
    // The SB's chips plus hero's posted big blind.
    pot_bb: round(facing + 1, 2),
    // Hero has already posted 1bb, so a limp leaves nothing to call.
    to_call_bb: round(facing - 1, 2),
  };
}

/**
 * Facing a 3-bet. Hero already has their open in, so the pot carries three
 * contributions — hero's open, the 3-bet, and whichever blinds neither of them
 * posted — and the price is the difference between the first two.
 */
function vs3BetPrompt(session: MockSession, hand: DealtHand): QuestionPrompt {
  const matchups = configuredMatchups(session.config, VS_3BET_MATCHUPS);
  const matchup = matchups[session.rng.pick(matchups.length)] ?? 'UTG_vs_BTN';
  const { hero, raiser } = seatsOf(matchup);
  const sizes = vs3BetSizes(raiser);
  const deadBlinds =
    (hero === 'SB' || raiser === 'SB' ? 0 : 0.5) +
    (hero === 'BB' || raiser === 'BB' ? 0 : 1);

  return {
    kind: 'vs_3bet',
    table_format: '8max',
    hero_position: hero,
    three_bettor_position: raiser,
    stack_bb: VS_3BET_RANGE.stack_bb,
    hand,
    // Everyone else is out: the seats behind the 3-bettor folded before the
    // action came back to hero.
    folded: POSITIONS_BY_FORMAT['8max'].filter(
      (seat) => seat !== hero && seat !== raiser
    ),
    open_size_bb: sizes.open,
    facing_size_bb: sizes.facing,
    pot_bb: round(sizes.open + sizes.facing + deadBlinds, 2),
    to_call_bb: round(sizes.facing - sizes.open, 2),
  };
}

/**
 * The served `bvb` schema names this field `situations`. It was `sb_actions`
 * here for as long as the mock hand-authored that drill, and the mismatch only
 * surfaced when `drills.json` was regenerated and started carrying `bvb` — the
 * same class of drift the fixture/contract pair exists to catch.
 */
function configuredSituations(config: DrillConfig): ('limp' | 'raise')[] {
  const value = config['situations'];
  const branches = Array.isArray(value) ? (value as ('limp' | 'raise')[]) : [];
  return branches.length > 0 ? branches : ['limp'];
}

function configuredMatchups(
  config: DrillConfig,
  fallback: readonly string[] = ['BB_vs_BTN']
): string[] {
  const value = config['matchups'];
  const matchups = Array.isArray(value) ? (value as string[]) : [];
  return matchups.length > 0 ? matchups : [...fallback];
}

function seatsBefore(format: TableFormat, hero: Position): Position[] {
  const order = POSITIONS_BY_FORMAT[format];
  const heroIndex = order.indexOf(hero);
  return heroIndex <= 0 ? [] : [...order.slice(0, heroIndex)];
}

// ---------------------------------------------------------------------------
// Grading (API-CONTRACT §4.3)
// ---------------------------------------------------------------------------

type GradedAnswer = Omit<AnswerResponse, 'progress'>;

/**
 * §4.3, generalised past a single non-fold action: the expected action is the
 * most frequent one in the chart when it is played at least half the time, and
 * fold otherwise. `expected.frequency` is the frequency of the expected action.
 */
function grade(question: Question, chosenActionId: string): GradedAnswer {
  const spot = spotPhrase(question.prompt);
  const notation = question.prompt.hand.notation;
  const chart = chartForPrompt(question.prompt);

  const result = gradeCell(
    chart.grid[notation] ?? {},
    chart.actions,
    chosenActionId
  );

  const label = (actionId: string) =>
    question.actions.find((action) => action.id === actionId)?.label ??
    actionId;

  const graded: GradedAnswer = {
    correct: result.correct,
    chosen: { action_id: chosenActionId, label: label(chosenActionId) },
    expected: {
      action_id: result.expectedActionId,
      label: label(result.expectedActionId),
      frequency: result.expectedFrequency,
    },
    explanation: {
      summary: explanationSummary(
        notation,
        spot,
        result.expectedActionId,
        label(result.expectedActionId),
        result.mixed
      ),
      detail: explanationDetail(
        notation,
        result.frequencies,
        label,
        chart.actions,
        result.mixed
      ),
      range_id: rangeIdForPrompt(question.prompt),
    },
  };

  return result.mixed ? { ...graded, mixed: true } : graded;
}

/**
 * How the explanation names the spot. For `bvb` that has to include the branch:
 * the same hand is a different decision after a limp than after a raise, and
 * "from BB" alone would not say which one was asked.
 */
function spotPhrase(prompt: QuestionPrompt): string {
  if (prompt.kind === 'bvb') {
    return `${prompt.hero_position} against an ${prompt.vs_position} ${prompt.sb_action}`;
  }
  return prompt.hero_position;
}

function explanationSummary(
  notation: string,
  spot: string,
  expectedActionId: string,
  expectedLabel: string,
  isMixed: boolean
): string {
  if (isMixed) {
    return `${notation} is a mixed spot from ${spot} — more than one line is acceptable.`;
  }
  if (expectedActionId === FOLD_ACTION_ID) {
    return `${notation} is a fold from ${spot}.`;
  }
  return `${notation} is a pure ${expectedLabel.toLowerCase()} from ${spot}.`;
}

function explanationDetail(
  notation: string,
  frequencies: ActionFrequencies,
  label: (actionId: string) => string,
  actionOrder: readonly string[],
  isMixed: boolean
): string {
  if (!isMixed) {
    const only = [...actionOrder, FOLD_ACTION_ID].find(
      (actionId) => (frequencies[actionId] ?? 0) > 0
    );
    return `The chart plays ${notation} as ${label(only ?? FOLD_ACTION_ID).toLowerCase()} every time from this position.`;
  }
  const split = [...actionOrder, FOLD_ACTION_ID]
    .filter((actionId) => (frequencies[actionId] ?? 0) > 0)
    .map(
      (actionId) =>
        `${label(actionId).toLowerCase()} ${Math.round((frequencies[actionId] ?? 0) * 100)}%`
    )
    .join(', ');
  return `The chart splits ${notation} between ${split}. Any of those is acceptable here; anything else is not.`;
}

// ---------------------------------------------------------------------------
// Summary (API-CONTRACT §4.4)
// ---------------------------------------------------------------------------

/**
 * One row per *configured* key, not per answered key — matching the live
 * backend. A position you selected but have not reached yet still gets a row,
 * with `answered: 0`; the UI is responsible for not rendering that as 0%.
 */
/**
 * How a drill groups its results. v2 §10: `vs_rfi` groups by matchup.
 *
 * `bvb` groups by branch, because hero is always the big blind and the villain
 * always the small blind — the seats carry no information, and what the small
 * blind did is the only thing that varies.
 */
function breakdownKeyOf(prompt: QuestionPrompt): string {
  if (prompt.kind === 'bvb') {
    return `${prompt.hero_position} vs ${prompt.vs_position} ${prompt.sb_action}`;
  }
  if (prompt.kind === 'vs_3bet') {
    return `${prompt.hero_position} vs ${prompt.three_bettor_position} 3-bet`;
  }
  return prompt.kind === 'vs_rfi'
    ? `${prompt.hero_position} vs ${prompt.raiser_position}`
    : prompt.hero_position;
}

/**
 * One row per configured group, not per answered group — matching the live
 * backend. A group selected but not yet reached still gets a row with
 * `answered: 0`; the UI is responsible for not rendering that as 0%.
 */
function buildBreakdown(session: MockSession): BreakdownRow[] {
  const labels = groupLabels(session);
  const configured =
    session.drillId === 'bvb'
      ? configuredSituations(session.config).map(
          (branch) => `BB vs SB ${branch}`
        )
      : session.drillId === 'vs_rfi'
        ? configuredMatchups(session.config).map((matchup) =>
            matchup.replace('_vs_', ' vs ')
          )
        : session.drillId === 'vs_3bet'
          ? configuredMatchups(session.config, VS_3BET_MATCHUPS).map(
              (matchup) => `${matchup.replace('_vs_', ' vs ')} 3-bet`
            )
          : configuredPositions(session.config);

  const rows = new Map<string, BreakdownRow>();
  for (const key of configured) {
    rows.set(key, {
      key,
      label: labels.get(key) ?? key,
      answered: 0,
      correct: 0,
      accuracy: 0,
    });
  }

  for (const entry of session.answered) {
    const key = breakdownKeyOf(entry.question.prompt);
    const row = rows.get(key) ?? {
      key,
      label: labels.get(key) ?? key,
      answered: 0,
      correct: 0,
      accuracy: 0,
    };
    row.answered += 1;
    if (entry.correct) row.correct += 1;
    row.accuracy = round(row.correct / row.answered, 4);
    rows.set(key, row);
  }

  const order = POSITIONS_BY_FORMAT[tableFormat(session.config)];
  return [...rows.values()].sort((a, b) => {
    const ai = order.indexOf(a.key as Position);
    const bi = order.indexOf(b.key as Position);
    // Matchup keys are not positions, so fall back to a stable alphabetical
    // order for any key the seat list does not contain.
    if (ai < 0 || bi < 0) return a.key.localeCompare(b.key);
    return ai - bi;
  });
}

/** Reuses the drill's own option labels rather than hardcoding group names. */
function groupLabels(session: MockSession): Map<string, string> {
  const drill = DRILLS.drills.find((entry) => entry.id === session.drillId);
  const field = drill?.config_schema.fields.find(
    (entry) =>
      entry.key === 'positions' ||
      entry.key === 'matchups' ||
      entry.key === 'sb_actions'
  );
  const options =
    field?.type === 'multi_enum'
      ? (field.options ?? field.options_by?.[tableFormat(session.config)] ?? [])
      : [];
  // Option values use the config form (`BB_vs_BTN`, `limp`), breakdown keys the
  // readable one (`BB vs BTN`, `BB vs SB limp`), so key both.
  const asBreakdownKey =
    session.drillId === 'bvb'
      ? (value: string) => `BB vs SB ${value}`
      : (value: string) => value.replace('_vs_', ' vs ');

  return new Map(
    options.flatMap((option) => [
      [option.value, option.label] as const,
      [asBreakdownKey(option.value), option.label] as const,
    ])
  );
}

function buildMistakes(session: MockSession): Mistake[] {
  return session.answered
    .filter((entry) => !entry.correct)
    .map((entry) => ({
      question_id: entry.question.question_id,
      position: entry.question.prompt.hero_position,
      hand: entry.question.prompt.hand.notation,
      chosen: entry.chosenActionId,
      expected: entry.expectedActionId,
      range_id: rangeIdForPrompt(entry.question.prompt),
    }));
}

// ---------------------------------------------------------------------------

function round(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

// Fail fast if the fixture ever stops being a complete chart — the mock's
// grading silently degrades to "everything folds" otherwise.
if (Object.keys(CO_RANGE.grid).length !== ALL_HANDS.length) {
  throw new Error(
    `range_rfi_6max_CO.json has ${Object.keys(CO_RANGE.grid).length} grid keys, expected ${ALL_HANDS.length}`
  );
}
for (const hand of Object.keys(CO_RANGE.grid)) {
  gridIndexOf(hand);
}
