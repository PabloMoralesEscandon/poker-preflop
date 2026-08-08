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
 */

import drillsFixture from '@fixtures/drills.json';
import rangeCoFixture from '@fixtures/range_rfi_6max_CO.json';
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
import {
  ALL_HANDS,
  cardsForNotation,
  combosOf,
  gridIndexOf,
  handTypeOf,
} from '../lib/hands';

const RFI_DRILLS = drillsFixture as DrillsResponse;

/**
 * The matchups this mock can serve. `BB_vs_BTN` is the real fixture — it calls
 * and 3-bets, so it exercises three buttons. `HJ_vs_UTG` is derived from it by
 * dropping every calling cell, because VS-RFI-CALIBRATION §4 records that this
 * matchup genuinely has no calling range: in position against an early open the
 * chart is 3-bet-or-fold. That gives a two-button spot without inventing a
 * strategy — the shape is real even though these particular cells are not.
 */
const VS_RFI_MATCHUPS = ['BB_vs_BTN', 'HJ_vs_UTG'] as const;

/**
 * `docs/examples/drills.json` still lists only `rfi`, although v2 §13 says
 * `GET /drills` lists `vs_rfi` alongside it with its own `config_schema`. The
 * schema below is therefore the mock's own, not a fixture — reported rather
 * than treated as settled. Its shape follows §3 exactly, which is the point of
 * the exercise: the generic config form should render it with no changes.
 *
 * Only the matchups this mock can actually serve are offered.
 */
const VS_RFI_DRILL: DrillInfo = {
  id: 'vs_rfi',
  name: 'Facing a Raise',
  description:
    'Decide whether to fold, call or 3-bet when one player has opened before you.',
  version: 1,
  config_schema: {
    fields: [
      {
        key: 'table_format',
        label: 'Table format',
        type: 'enum',
        default: '6max',
        options: [{ value: '6max', label: '6-max' }],
      },
      {
        key: 'matchups',
        label: 'Matchups',
        type: 'multi_enum',
        default: ['BB_vs_BTN'],
        depends_on: 'table_format',
        options_by: {
          '6max': VS_RFI_MATCHUPS.map((matchup) => ({
            value: matchup,
            label: matchup.replace('_vs_', ' vs '),
          })),
        },
      },
      {
        key: 'question_count',
        label: 'Hands',
        type: 'int',
        default: 25,
        min: 5,
        max: 200,
      },
      {
        key: 'weighting',
        label: 'Hand selection',
        type: 'enum',
        default: 'borderline',
        options: [
          { value: 'uniform', label: 'Uniform — any of the 169 hands' },
          {
            value: 'borderline',
            label: 'Borderline — favour close decisions',
          },
        ],
      },
    ],
  },
};

const DRILLS: DrillsResponse = {
  drills: [...RFI_DRILLS.drills, VS_RFI_DRILL],
};
const RAISE_ACTION_ID = 'raise';
const LIMP_ACTION_ID = 'limp';

/**
 * `range_rfi_6max_CO.json` was not migrated when v2 replaced `open_size_bb`
 * with `action_sizes_bb` and made `stats.by_action` required — it is still v1
 * shaped, while the other two range fixtures are v2. `docs/` is read-only to
 * me, so the mock reads whichever form it finds and this is reported rather
 * than papered over. Delete the fallback once the fixture is migrated.
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
const VS_RFI_RANGE = normaliseRange(rangeVsRfiFixture);
const SOURCES = sourcesFixture as unknown as SourcesResponse;

/** Ranges served verbatim from a fixture, keyed by id. */
const FIXTURE_RANGES: Record<string, RangeDetail> = {
  [VS_RFI_RANGE.range_id]: VS_RFI_RANGE,
};

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
}

function formatBb(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

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

/**
 * A matchup this mock can serve, keyed as the range id suffix.
 *
 * `BB_vs_BTN` is the real fixture: it calls and 3-bets, so it exercises three
 * buttons. `HJ_vs_UTG` is derived from it by dropping every calling cell,
 * because VS-RFI-CALIBRATION §4 records that this matchup genuinely has no
 * calling range — in position against an early open the chart is 3-bet-or-fold.
 * That gives a two-button spot to render without inventing a strategy: the
 * shape is real even though these particular cells are not.
 */
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
  // VS-RFI-CALIBRATION §1: 3.5x in position, 4x out of position.
  const threeBetSize = outOfPosition ? 4 : 3.5;
  const facing = VS_RFI_RANGE.facing_size_bb ?? 2.5;

  if (matchup === 'HJ_vs_UTG') {
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
  };
}

/** The chart a question was generated from, and is graded against. */
function chartForPrompt(prompt: QuestionPrompt): MockChart {
  if (prompt.kind === 'vs_rfi') {
    return vsRfiChartFor(
      `${prompt.hero_position}_vs_${prompt.raiser_position}`
    );
  }
  return chartFor(prompt.hero_position);
}

function rangeIdForPrompt(prompt: QuestionPrompt): string {
  return prompt.kind === 'vs_rfi'
    ? `vs_rfi_${prompt.table_format}_${prompt.hero_position}_vs_${prompt.raiser_position}`
    : `rfi_${prompt.table_format}_${prompt.hero_position}`;
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

/** RANGE-DATA-FORMAT §4: combo-weighted stats over the 1326 starting combos. */
function statsFor(grid: RangeGrid): RangeStats {
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

  const matchups = VS_RFI_MATCHUPS.map((matchup) => {
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

  return [
    ...derived,
    ...matchups.filter((entry) => entry.range_id !== VS_RFI_RANGE.range_id),
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
    const chart =
      listed.spot === 'vs_rfi'
        ? vsRfiChartFor(`${listed.position}_vs_${listed.vs_position ?? 'BTN'}`)
        : chartFor(listed.position);
    return {
      ...clone(listed.spot === 'vs_rfi' ? VS_RFI_RANGE : CO_RANGE),
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
      stats: statsFor(chart.grid),
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

/** Total non-fold frequency. Fold frequency is `1 - played` and never stored. */
function playedFrequency(frequencies: ActionFrequencies): number {
  return Object.values(frequencies).reduce((sum, value) => sum + value, 0);
}

function generateQuestion(session: MockSession, total: number): Question {
  const format = tableFormat(session.config);
  const weights =
    session.config['weighting'] === 'uniform'
      ? UNIFORM_WEIGHTS
      : BORDERLINE_WEIGHTS;
  const notation = ALL_HANDS[session.rng.weighted(weights)] ?? 'AA';
  const cards = cardsForNotation(notation, (bound) => session.rng.pick(bound));
  const hand = { cards, notation };
  const index = session.answered.length + 1;

  const prompt =
    session.drillId === 'vs_rfi'
      ? vsRfiPrompt(session, format, hand)
      : rfiPrompt(session, format, hand);

  const chart = chartForPrompt(prompt);
  return {
    question_id: `q_${index}`,
    index,
    total,
    drill_id: session.drillId,
    prompt,
    actions: [
      { id: FOLD_ACTION_ID, label: 'Fold' },
      ...chart.actions.map((id) => ({
        id,
        label: chart.actionLabels[id] ?? id,
      })),
    ],
  };
}

function rfiPrompt(
  session: MockSession,
  format: TableFormat,
  hand: DealtHand
): QuestionPrompt {
  const positions = configuredPositions(session.config);
  const heroPosition =
    positions[session.rng.pick(positions.length)] ?? ('CO' as Position);
  return {
    kind: 'rfi',
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

function configuredMatchups(config: DrillConfig): string[] {
  const value = config['matchups'];
  const matchups = Array.isArray(value) ? (value as string[]) : [];
  return matchups.length > 0 ? matchups : ['BB_vs_BTN'];
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
  const position = question.prompt.hero_position;
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
        position,
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

function explanationSummary(
  notation: string,
  position: Position,
  expectedActionId: string,
  expectedLabel: string,
  isMixed: boolean
): string {
  if (isMixed) {
    return `${notation} is a mixed spot from ${position} — more than one line is acceptable.`;
  }
  if (expectedActionId === FOLD_ACTION_ID) {
    return `${notation} is a fold from ${position}.`;
  }
  return `${notation} is a pure ${expectedLabel.toLowerCase()} from ${position}.`;
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
/** How a drill groups its results. v2 §10: `vs_rfi` groups by matchup. */
function breakdownKeyOf(prompt: QuestionPrompt): string {
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
    session.drillId === 'vs_rfi'
      ? configuredMatchups(session.config).map((matchup) =>
          matchup.replace('_vs_', ' vs ')
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
    (entry) => entry.key === 'positions' || entry.key === 'matchups'
  );
  const options =
    field?.type === 'multi_enum'
      ? (field.options ?? field.options_by?.[tableFormat(session.config)] ?? [])
      : [];
  // Matchup option values use the file-name form, breakdown keys the readable
  // one, so key both.
  return new Map(
    options.flatMap((option) => [
      [option.value, option.label] as const,
      [option.value.replace('_vs_', ' vs '), option.label] as const,
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
