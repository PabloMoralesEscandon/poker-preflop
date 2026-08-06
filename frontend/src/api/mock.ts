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
 * Two honest limitations, both contained in this file:
 *
 *  1. `range_rfi_6max_CO.json` is the only chart that exists before the backend
 *     lands, so every position is graded against it. Mock feedback is therefore
 *     shaped correctly and varies by hand, but it is NOT poker advice and the
 *     per-position differences a real chart set would show are absent.
 *  2. `weighting: "borderline"` is approximated (combo weight × 6 on mixed
 *     hands) rather than implementing the neighbour scan in
 *     RANGE-DATA-FORMAT §6. The real sampler is the backend's.
 */

import drillsFixture from '@fixtures/drills.json';
import rangesListFixture from '@fixtures/ranges_list.json';
import rangeCoFixture from '@fixtures/range_rfi_6max_CO.json';

import { ApiError, type ApiClient } from './client';
import {
  POSITIONS_BY_FORMAT,
  type AnswerRequest,
  type AnswerResponse,
  type BreakdownRow,
  type ConfigField,
  type CreateSessionRequest,
  type DrillConfig,
  type DrillInfo,
  type DrillsResponse,
  type HealthResponse,
  type Mistake,
  type NextResponse,
  type Position,
  type Question,
  type RangeDetail,
  type RangeFilter,
  type RangesResponse,
  type SessionResponse,
  type SessionSummary,
  type TableFormat,
} from './types';
import {
  ALL_HANDS,
  cardsForNotation,
  combosOf,
  gridIndexOf,
} from '../lib/hands';

const DRILLS = drillsFixture as DrillsResponse;
const RANGES = rangesListFixture as unknown as RangesResponse;
const CO_RANGE = rangeCoFixture as unknown as RangeDetail;

const FOLD_ACTION_ID = 'fold';
const RAISE_ACTION_ID = 'raise';

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

  async listRanges(filter?: RangeFilter): Promise<RangesResponse> {
    const ranges = RANGES.ranges.filter(
      (entry) =>
        (filter?.spot === undefined || entry.spot === filter.spot) &&
        (filter?.table_format === undefined ||
          entry.table_format === filter.table_format)
    );
    return { ranges: clone(ranges) };
  }

  async getRange(rangeId: string): Promise<RangeDetail> {
    const listed = RANGES.ranges.find((entry) => entry.range_id === rangeId);
    if (!listed) {
      throw new ApiError(
        'range_not_found',
        `Unknown range id ${rangeId}.`,
        404
      );
    }
    // Only the CO chart exists as a fixture. Serving it under the requested id
    // keeps the mock self-consistent: this is the chart the answer was graded
    // against. It is illustrative data, not a real chart for that position.
    return {
      ...clone(CO_RANGE),
      range_id: listed.range_id,
      position: listed.position,
      table_format: listed.table_format,
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
  return config['table_format'] === '9max' ? '9max' : '6max';
}

function configuredPositions(config: DrillConfig): Position[] {
  const value = config['positions'];
  const positions = Array.isArray(value) ? (value as Position[]) : [];
  return positions.length > 0 ? positions : ['CO'];
}

// ---------------------------------------------------------------------------
// Question generation
// ---------------------------------------------------------------------------

/** Hand weights, recomputed once because the chart never changes. */
const UNIFORM_WEIGHTS = ALL_HANDS.map((hand) => combosOf(hand));
const BORDERLINE_WEIGHTS = ALL_HANDS.map((hand) => {
  const frequency = raiseFrequency(hand);
  return combosOf(hand) * (frequency > 0 && frequency < 1 ? 6 : 1);
});

function raiseFrequency(hand: string): number {
  return CO_RANGE.grid[hand]?.[RAISE_ACTION_ID] ?? 0;
}

function generateQuestion(session: MockSession, total: number): Question {
  const format = tableFormat(session.config);
  const positions = configuredPositions(session.config);
  const heroPosition =
    positions[session.rng.pick(positions.length)] ?? ('CO' as Position);

  const weights =
    session.config['weighting'] === 'uniform'
      ? UNIFORM_WEIGHTS
      : BORDERLINE_WEIGHTS;
  const notation = ALL_HANDS[session.rng.weighted(weights)] ?? 'AA';
  const cards = cardsForNotation(notation, (bound) => session.rng.pick(bound));

  const index = session.answered.length + 1;
  const openSize = heroPosition === 'SB' ? 3 : CO_RANGE.open_size_bb;

  return {
    question_id: `q_${index}`,
    index,
    total,
    drill_id: session.drillId,
    prompt: {
      kind: 'rfi',
      table_format: format,
      hero_position: heroPosition,
      stack_bb: CO_RANGE.stack_bb,
      hand: { cards, notation },
      folded_before: seatsBefore(format, heroPosition),
      pot_bb: 1.5,
    },
    actions: [
      { id: FOLD_ACTION_ID, label: 'Fold' },
      { id: RAISE_ACTION_ID, label: `Raise ${formatBb(openSize)}bb` },
    ],
  };
}

function seatsBefore(format: TableFormat, hero: Position): Position[] {
  const order = POSITIONS_BY_FORMAT[format];
  const heroIndex = order.indexOf(hero);
  return heroIndex <= 0 ? [] : [...order.slice(0, heroIndex)];
}

function formatBb(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

// ---------------------------------------------------------------------------
// Grading (API-CONTRACT §4.3)
// ---------------------------------------------------------------------------

type GradedAnswer = Omit<AnswerResponse, 'progress'>;

function grade(question: Question, chosenActionId: string): GradedAnswer {
  const notation = question.prompt.hand.notation;
  const raise = raiseFrequency(notation);
  const isMixed = raise > 0 && raise < 1;

  const expectedActionId = raise >= 0.5 ? RAISE_ACTION_ID : FOLD_ACTION_ID;
  const expectedFrequency =
    expectedActionId === RAISE_ACTION_ID ? raise : 1 - raise;

  const label = (actionId: string) =>
    question.actions.find((action) => action.id === actionId)?.label ??
    actionId;

  // §4.3: a mixed hand answered either way is not a mistake.
  const correct = isMixed || chosenActionId === expectedActionId;

  const rangeId = `rfi_${question.prompt.table_format}_${question.prompt.hero_position}`;

  const graded: GradedAnswer = {
    correct,
    chosen: { action_id: chosenActionId, label: label(chosenActionId) },
    expected: {
      action_id: expectedActionId,
      label: label(expectedActionId),
      frequency: round(expectedFrequency, 2),
    },
    explanation: {
      summary: explanationSummary(
        notation,
        question.prompt.hero_position,
        raise
      ),
      detail: explanationDetail(notation, raise),
      range_id: rangeId,
    },
  };

  return isMixed ? { ...graded, mixed: true } : graded;
}

function explanationSummary(
  notation: string,
  position: Position,
  raise: number
): string {
  if (raise === 1) return `${notation} is a pure open from ${position}.`;
  if (raise === 0) return `${notation} is a fold from ${position}.`;
  return `${notation} is a mixed spot from ${position} — either action is acceptable.`;
}

function explanationDetail(notation: string, raise: number): string {
  const percent = `${Math.round(raise * 100)}%`;
  if (raise === 1) {
    return `The chart opens ${notation} every time from this position.`;
  }
  if (raise === 0) {
    return `${notation} is outside the opening range for this position, so it folds.`;
  }
  return `The chart opens ${notation} ${percent} of the time. Hands on this boundary are close enough that neither choice is a mistake.`;
}

// ---------------------------------------------------------------------------
// Summary (API-CONTRACT §4.4)
// ---------------------------------------------------------------------------

function buildBreakdown(session: MockSession): BreakdownRow[] {
  const labels = positionLabels(session);
  const rows = new Map<string, BreakdownRow>();

  for (const entry of session.answered) {
    const key = entry.question.prompt.hero_position;
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
  return [...rows.values()].sort(
    (a, b) =>
      order.indexOf(a.key as Position) - order.indexOf(b.key as Position)
  );
}

/** Reuses the drill's own option labels rather than hardcoding position names. */
function positionLabels(session: MockSession): Map<string, string> {
  const drill = DRILLS.drills.find((entry) => entry.id === session.drillId);
  const field = drill?.config_schema.fields.find(
    (entry) => entry.key === 'positions'
  );
  const options =
    field?.type === 'multi_enum'
      ? (field.options ?? field.options_by?.[tableFormat(session.config)] ?? [])
      : [];
  return new Map(options.map((option) => [option.value, option.label]));
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
      range_id: `rfi_${entry.question.prompt.table_format}_${entry.question.prompt.hero_position}`,
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
