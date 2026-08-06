import { ApiError, type ApiClient } from './client';
import {
  isApiErrorCode,
  type AnswerRequest,
  type AnswerResponse,
  type CreateSessionRequest,
  type DrillsResponse,
  type HealthResponse,
  type NextResponse,
  type RangeDetail,
  type RangeFilter,
  type RangesResponse,
  type SessionResponse,
  type SessionSummary,
} from './types';

export const DEFAULT_API_BASE_URL = 'http://localhost:8000/api/v1';

/** Talks to a running server over HTTP. */
export class LiveApiClient implements ApiClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(
    baseUrl: string = DEFAULT_API_BASE_URL,
    fetchImpl?: typeof fetch
  ) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.fetchImpl = fetchImpl ?? globalThis.fetch.bind(globalThis);
  }

  getHealth(signal?: AbortSignal): Promise<HealthResponse> {
    return this.request<HealthResponse>('GET', '/health', undefined, signal);
  }

  listDrills(signal?: AbortSignal): Promise<DrillsResponse> {
    return this.request<DrillsResponse>('GET', '/drills', undefined, signal);
  }

  createSession(
    request: CreateSessionRequest,
    signal?: AbortSignal
  ): Promise<SessionResponse> {
    return this.request<SessionResponse>('POST', '/sessions', request, signal);
  }

  getNextQuestion(
    sessionId: string,
    signal?: AbortSignal
  ): Promise<NextResponse> {
    const path = `/sessions/${encodeURIComponent(sessionId)}/next`;
    return this.request<NextResponse>('GET', path, undefined, signal);
  }

  submitAnswer(
    sessionId: string,
    request: AnswerRequest,
    signal?: AbortSignal
  ): Promise<AnswerResponse> {
    const path = `/sessions/${encodeURIComponent(sessionId)}/answer`;
    return this.request<AnswerResponse>('POST', path, request, signal);
  }

  getSummary(sessionId: string, signal?: AbortSignal): Promise<SessionSummary> {
    const path = `/sessions/${encodeURIComponent(sessionId)}/summary`;
    return this.request<SessionSummary>('GET', path, undefined, signal);
  }

  listRanges(
    filter?: RangeFilter,
    signal?: AbortSignal
  ): Promise<RangesResponse> {
    const query = new URLSearchParams();
    if (filter?.spot) query.set('spot', filter.spot);
    if (filter?.table_format) query.set('table_format', filter.table_format);
    const queryString = query.toString();
    const suffix = queryString === '' ? '' : `?${queryString}`;
    return this.request<RangesResponse>(
      'GET',
      `/ranges${suffix}`,
      undefined,
      signal
    );
  }

  getRange(rangeId: string, signal?: AbortSignal): Promise<RangeDetail> {
    const path = `/ranges/${encodeURIComponent(rangeId)}`;
    return this.request<RangeDetail>('GET', path, undefined, signal);
  }

  private async request<T>(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
    signal?: AbortSignal
  ): Promise<T> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    const init: RequestInit = { method, headers };
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(body);
    }
    if (signal) init.signal = signal;

    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}${path}`, init);
    } catch (cause) {
      // A transport failure has no envelope, so give it the closest code we own
      // rather than letting a bare TypeError escape the api layer.
      throw new ApiError(
        'internal_error',
        cause instanceof Error ? cause.message : 'Network request failed.',
        0
      );
    }

    if (!response.ok) {
      throw await parseErrorEnvelope(response);
    }

    return (await response.json()) as T;
  }
}

/**
 * Turns a non-2xx response into a typed {@link ApiError}. Anything that is not
 * a well-formed envelope (an HTML error page, an empty body, a proxy failure)
 * degrades to `internal_error` with the status preserved.
 */
export async function parseErrorEnvelope(
  response: Response
): Promise<ApiError> {
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return new ApiError(
      'internal_error',
      `Request failed with status ${response.status}.`,
      response.status
    );
  }

  const envelope =
    typeof payload === 'object' && payload !== null
      ? (payload as { error?: unknown }).error
      : undefined;

  if (typeof envelope !== 'object' || envelope === null) {
    return new ApiError(
      'internal_error',
      `Request failed with status ${response.status}.`,
      response.status
    );
  }

  const { code, message, field } = envelope as Record<string, unknown>;

  return new ApiError(
    isApiErrorCode(code) ? code : 'internal_error',
    typeof message === 'string' && message !== ''
      ? message
      : `Request failed with status ${response.status}.`,
    response.status,
    typeof field === 'string' ? field : undefined
  );
}
