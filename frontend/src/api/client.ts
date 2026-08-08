import type {
  AnswerRequest,
  AnswerResponse,
  ApiErrorCode,
  CreateSessionRequest,
  DrillsResponse,
  HealthResponse,
  NextResponse,
  RangeDetail,
  RangeFilter,
  RangesResponse,
  SessionResponse,
  SessionSummary,
  SourcesResponse,
} from './types';

/**
 * Every endpoint in docs/API-CONTRACT.md. Two implementations satisfy it: the
 * live fetch client and the in-process mock.
 *
 * Nothing outside `src/api/` may know which one it is holding.
 */
export interface ApiClient {
  /** §2 `GET /health` */
  getHealth(signal?: AbortSignal): Promise<HealthResponse>;
  /** §3 `GET /drills` */
  listDrills(signal?: AbortSignal): Promise<DrillsResponse>;
  /** §4.1 `POST /sessions` */
  createSession(
    request: CreateSessionRequest,
    signal?: AbortSignal
  ): Promise<SessionResponse>;
  /** §4.2 `GET /sessions/{id}/next` */
  getNextQuestion(
    sessionId: string,
    signal?: AbortSignal
  ): Promise<NextResponse>;
  /** §4.3 `POST /sessions/{id}/answer` */
  submitAnswer(
    sessionId: string,
    request: AnswerRequest,
    signal?: AbortSignal
  ): Promise<AnswerResponse>;
  /** §4.4 `GET /sessions/{id}/summary` */
  getSummary(sessionId: string, signal?: AbortSignal): Promise<SessionSummary>;
  /** v2 §11 `GET /sources` */
  getSources(signal?: AbortSignal): Promise<SourcesResponse>;
  /** §5.1 `GET /ranges` */
  listRanges(
    filter?: RangeFilter,
    signal?: AbortSignal
  ): Promise<RangesResponse>;
  /** §5.2 `GET /ranges/{range_id}` */
  getRange(rangeId: string, signal?: AbortSignal): Promise<RangeDetail>;
}

/**
 * A typed failure carrying the contract's error `code`. Callers switch on
 * `code` — never on `message`, which is human-facing and may change.
 */
export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly field: string | undefined;

  constructor(
    code: ApiErrorCode,
    message: string,
    status: number,
    field?: string
  ) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.field = field;
  }
}

export function isApiError(value: unknown): value is ApiError {
  return value instanceof ApiError;
}
