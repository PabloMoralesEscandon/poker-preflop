/**
 * Hand-written mirror of docs/API-CONTRACT.md v1.
 *
 * The contract is frozen. If something here disagrees
 * with the document, the document wins and the disagreement is a bug to report,
 * not to work around.
 */

// ---------------------------------------------------------------------------
// §1 Vocabulary
// ---------------------------------------------------------------------------

export type TableFormat = '6max' | '8max';

export type Position =
  'UTG' | 'UTG1' | 'LJ' | 'HJ' | 'CO' | 'BTN' | 'SB' | 'BB';

/** Ordered seats per format. `BB` can never open, so it never appears as hero. */
export const POSITIONS_BY_FORMAT: Record<TableFormat, readonly Position[]> = {
  '6max': ['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB'],
  '8max': ['UTG', 'UTG1', 'LJ', 'HJ', 'CO', 'BTN', 'SB', 'BB'],
};

/** One of the 169 shorthand hands: `AA`…`22`, `AKs`…`32s`, `AKo`…`32o`. */
export type HandNotation = string;

/** Rank plus lowercase suit: `Ah`, `Ks`, `Td`, `2c`. */
export type Card = string;

// ---------------------------------------------------------------------------
// §2 Health
// ---------------------------------------------------------------------------

export interface HealthResponse {
  status: string;
  version: string;
}

// ---------------------------------------------------------------------------
// §3 Drills and the declarative config schema
// ---------------------------------------------------------------------------

export interface ConfigOption {
  value: string;
  label: string;
}

interface ConfigFieldBase {
  key: string;
  label: string;
}

export interface EnumField extends ConfigFieldBase {
  type: 'enum';
  default: string;
  options: ConfigOption[];
}

export interface MultiEnumField extends ConfigFieldBase {
  type: 'multi_enum';
  default: string[];
  /** Either a flat option list… */
  options?: ConfigOption[];
  /** …or options that depend on another field's current value. */
  depends_on?: string;
  options_by?: Record<string, ConfigOption[]>;
}

export interface IntField extends ConfigFieldBase {
  type: 'int';
  default: number;
  min: number;
  max: number;
}

export interface BoolField extends ConfigFieldBase {
  type: 'bool';
  default: boolean;
}

/** Discriminated on `type`; the config form renders generically from this. */
export type ConfigField = EnumField | MultiEnumField | IntField | BoolField;

export interface ConfigSchema {
  fields: ConfigField[];
}

export interface DrillInfo {
  id: string;
  name: string;
  description: string;
  version: number;
  config_schema: ConfigSchema;
}

export interface DrillsResponse {
  drills: DrillInfo[];
}

// ---------------------------------------------------------------------------
// §4 Sessions
// ---------------------------------------------------------------------------

export type ConfigValue = string | number | boolean | string[];

/** Drill config is data. The frontend never hardcodes a drill's option keys. */
export type DrillConfig = Record<string, ConfigValue>;

export interface CreateSessionRequest {
  drill_id: string;
  config: DrillConfig;
  seed?: number;
}

export interface SessionResponse {
  session_id: string;
  drill_id: string;
  config: DrillConfig;
  seed: number;
  created_at: string;
}

export interface DealtHand {
  cards: [Card, Card];
  notation: HandNotation;
}

/** Prompt for drill #1. Each drill adds a member to {@link QuestionPrompt}. */
export interface RfiPrompt {
  kind: 'rfi';
  table_format: TableFormat;
  hero_position: Position;
  stack_bb: number;
  hand: DealtHand;
  folded_before: Position[];
  pot_bb: number;
}

/** Prompt for drill #2: facing a single raise (v2 §10). */
export interface VsRfiPrompt {
  kind: 'vs_rfi';
  table_format: TableFormat;
  hero_position: Position;
  raiser_position: Position;
  stack_bb: number;
  hand: DealtHand;
  folded_before: Position[];
  /** The raise hero faces. */
  facing_size_bb: number;
  /** The pot before hero acts. Computed server-side; never derived here. */
  pot_bb: number;
  /** What hero must add to call. Also server-side. */
  to_call_bb: number;
}

/**
 * Prompt for drill #3: blind versus blind.
 *
 * Mirrored from `docs/examples/next_question_bvb_limp.json`, because
 * API-CONTRACT.md stops at §13 and never describes this prompt — see the
 * finding raised with FE-13. If the contract later documents a different shape,
 * the contract wins.
 *
 * Two things here are unlike the other prompts:
 *
 *  - **`sb_action` changes which actions are legal.** On the limp branch fold
 *    is not offered at all (RANGE-DATA-FORMAT §9); on the raise branch it is.
 *    The component must never assume a fold button exists.
 *  - **There is no `folded_before`.** Blind versus blind is heads-up by the
 *    time hero acts, so the seat strip is derived from the two seats named
 *    here rather than from a fold list.
 */
export interface BvbPrompt {
  kind: 'bvb';
  table_format: TableFormat;
  /** Always the big blind in this spot, but read from the payload regardless. */
  hero_position: Position;
  /** The small blind. */
  vs_position: Position;
  /** What the small blind did. It decides the legal action set. */
  sb_action: 'limp' | 'raise';
  stack_bb: number;
  hand: DealtHand;
  /** What hero faces: `1.0` for a limp, the open size for a raise. */
  facing_size_bb: number;
  /** The pot before hero acts. Computed server-side; never derived here. */
  pot_bb: number;
  /** What hero must add to continue. `0` on the limp branch — hero is in free. */
  to_call_bb: number;
}

/** Discriminated on `prompt.kind` — the key of the frontend drill registry. */
export type QuestionPrompt = RfiPrompt | VsRfiPrompt | BvbPrompt;

export interface ActionOption {
  id: string;
  label: string;
}

export interface Question {
  question_id: string;
  index: number;
  total: number;
  drill_id: string;
  prompt: QuestionPrompt;
  /** Labels are server-provided and rendered verbatim. Never compute sizings. */
  actions: ActionOption[];
}

/** Discriminated on `done`. */
export type NextResponse =
  { done: false; question: Question } | { done: true; question: null };

export interface AnswerRequest {
  question_id: string;
  action_id: string;
}

export interface ChosenAction {
  action_id: string;
  label: string;
}

export interface ExpectedAction extends ChosenAction {
  frequency: number;
}

export interface Explanation {
  summary: string;
  detail: string;
  range_id: string;
}

export interface Progress {
  answered: number;
  correct: number;
  total: number;
}

export interface AnswerResponse {
  correct: boolean;
  /** Present and true when `0 < frequency < 1`; either action is acceptable. */
  mixed?: boolean;
  chosen: ChosenAction;
  expected: ExpectedAction;
  explanation: Explanation;
  progress: Progress;
}

/** Drill-defined grouping. Rendered generically from key/label/accuracy. */
export interface BreakdownRow {
  key: string;
  label: string;
  answered: number;
  correct: number;
  accuracy: number;
}

export interface Mistake {
  question_id: string;
  position: string;
  hand: HandNotation;
  chosen: string;
  expected: string;
  range_id: string;
}

export interface SessionSummary {
  session_id: string;
  drill_id: string;
  answered: number;
  correct: number;
  accuracy: number;
  complete: boolean;
  breakdown: BreakdownRow[];
  mistakes: Mistake[];
}

// ---------------------------------------------------------------------------
// §5 Ranges
// ---------------------------------------------------------------------------

/**
 * Identity plus everything the chart browser needs to render a card without
 * fetching all 26 grids (v2 §12).
 */
export interface RangeListItem {
  range_id: string;
  spot: string;
  table_format: TableFormat;
  position: Position;
  /** The opponent's seat for a `vs_*` spot; `null` for spots without one. */
  vs_position: Position | null;
  stack_bb: number;
  actions: string[];
  /** Action id → the size that action commits, in big blinds. */
  action_sizes_bb: Record<string, number>;
  /** The raise hero is facing, for a `vs_*` spot; `null` otherwise. */
  facing_size_bb: number | null;
  source_id: string;
  stats: RangeStats;
}

export interface RangesResponse {
  ranges: RangeListItem[];
}

export interface RangeFilter {
  spot?: string;
  table_format?: TableFormat;
  position?: Position;
  vs_position?: Position;
}

/**
 * Action id → frequency in `(0, 1]`. Zero-frequency actions are omitted, so a
 * pure fold is `{}` and fold frequency is `1 - sum(values)`.
 *
 * Deliberately an object, not a number: the call/3-bet drills need
 * `{"call": 0.6, "raise": 0.4}` in the same slot.
 */
export type ActionFrequencies = Record<string, number>;

/** Exactly 169 keys. */
export type RangeGrid = Record<HandNotation, ActionFrequencies>;

export interface RangeStats {
  combos: number;
  vpip: number;
  hands_played: number;
  /**
   * Combos per action. The number a human reads against the chart's own printed
   * totals, which is what makes the browser an audit tool rather than a gallery.
   */
  by_action: Record<string, number>;
}

export interface RangeDetail {
  range_id: string;
  spot: string;
  table_format: TableFormat;
  position: Position;
  vs_position: Position | null;
  stack_bb: number;
  /** Replaces v1's `open_size_bb`; carries a size per action (v2 §13). */
  action_sizes_bb: Record<string, number>;
  facing_size_bb: number | null;
  source_id: string;
  /** The range file's own notes. Shown verbatim; never paraphrased. */
  notes: string;
  actions: string[];
  grid: RangeGrid;
  stats: RangeStats;
}

// ---------------------------------------------------------------------------
// v2 §11 Sources
// ---------------------------------------------------------------------------

export type SourceRole = 'primary' | 'cross-check' | 'not-usable' | 'fixture';

export interface SourceInfo {
  source_id: string;
  name: string;
  url: string | null;
  role: SourceRole;
  table_formats: TableFormat[];
  /** When a human last opened the source and confirmed it. */
  verified_on: string | null;
  notes: string;
}

export interface SourcesResponse {
  sources: SourceInfo[];
}

// ---------------------------------------------------------------------------
// §7 Error envelope
// ---------------------------------------------------------------------------

export const API_ERROR_CODES = [
  'invalid_request',
  'invalid_config',
  'drill_not_found',
  'session_not_found',
  'range_not_found',
  'question_out_of_order',
  'question_already_answered',
  'internal_error',
] as const;

/** Closed set. The frontend switches on this, never on `message`. */
export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

export function isApiErrorCode(value: unknown): value is ApiErrorCode {
  return (
    typeof value === 'string' &&
    (API_ERROR_CODES as readonly string[]).includes(value)
  );
}

export interface ErrorBody {
  code: ApiErrorCode;
  message: string;
  field?: string;
}

export interface ErrorEnvelope {
  error: ErrorBody;
}
