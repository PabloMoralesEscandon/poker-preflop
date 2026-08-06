import { describe, expect, it, vi } from 'vitest';

import errorsFixture from '@fixtures/errors.json';
import nextQuestionFixture from '@fixtures/next_question.json';

import { ApiError, isApiError } from '@/api/client';
import { LiveApiClient } from '@/api/live';

const BASE = 'http://api.test/api/v1';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

type FetchFn = (
  input: string | URL | Request,
  init?: RequestInit
) => Promise<Response>;

function clientReturning(response: Response | (() => Response)) {
  const fetchImpl = vi.fn<FetchFn>(async () =>
    typeof response === 'function' ? response() : response
  );
  return {
    client: new LiveApiClient(BASE, fetchImpl as unknown as typeof fetch),
    fetchImpl,
  };
}

/** The URL a recorded call was made with. */
function calledUrl(
  fetchImpl: ReturnType<typeof vi.fn<FetchFn>>,
  index: number
) {
  return String(fetchImpl.mock.calls[index]?.[0]);
}

describe('live client requests', () => {
  it('builds the URL and method for each endpoint', async () => {
    const { client, fetchImpl } = clientReturning(() => jsonResponse({}));

    await client.getHealth();
    await client.listDrills();
    await client.getNextQuestion('s_1');
    await client.getSummary('s_1');
    await client.getRange('rfi_6max_CO');

    const calls = fetchImpl.mock.calls.map(([url]) => String(url));
    expect(calls).toEqual([
      `${BASE}/health`,
      `${BASE}/drills`,
      `${BASE}/sessions/s_1/next`,
      `${BASE}/sessions/s_1/summary`,
      `${BASE}/ranges/rfi_6max_CO`,
    ]);
  });

  it('strips a trailing slash from the base URL', async () => {
    const fetchImpl = vi.fn<FetchFn>(async () => jsonResponse({}));
    const client = new LiveApiClient(
      `${BASE}/`,
      fetchImpl as unknown as typeof fetch
    );
    await client.getHealth();
    expect(calledUrl(fetchImpl, 0)).toBe(`${BASE}/health`);
  });

  it('sends a JSON body on POST', async () => {
    const { client, fetchImpl } = clientReturning(() => jsonResponse({}));
    await client.submitAnswer('s_1', {
      question_id: 'q_3',
      action_id: 'raise',
    });

    const init = fetchImpl.mock.calls[0]?.[1];
    expect(init?.method).toBe('POST');
    expect(init?.body).toBe('{"question_id":"q_3","action_id":"raise"}');
    expect(init?.headers).toMatchObject({
      'Content-Type': 'application/json',
    });
  });

  it('encodes range filters as query parameters', async () => {
    const { client, fetchImpl } = clientReturning(() => jsonResponse({}));
    await client.listRanges({ spot: 'rfi', table_format: '6max' });
    await client.listRanges();

    expect(calledUrl(fetchImpl, 0)).toBe(
      `${BASE}/ranges?spot=rfi&table_format=6max`
    );
    expect(calledUrl(fetchImpl, 1)).toBe(`${BASE}/ranges`);
  });

  it('returns the parsed body on success', async () => {
    const { client } = clientReturning(() => jsonResponse(nextQuestionFixture));
    const next = await client.getNextQuestion('s_1');
    expect(next.done).toBe(false);
    if (next.done) throw new Error('unreachable');
    expect(next.question.question_id).toBe('q_3');
    expect(next.question.prompt.hand.notation).toBe('AKo');
  });
});

describe('live client error envelope parsing', () => {
  it('parses every error in the fixture into a typed ApiError', async () => {
    for (const [code, entry] of Object.entries(errorsFixture)) {
      const { client } = clientReturning(() =>
        jsonResponse(entry.body, entry.status)
      );

      const error = await client.getHealth().catch((caught: unknown) => caught);
      expect(isApiError(error)).toBe(true);
      const apiError = error as ApiError;
      expect(apiError.code).toBe(code);
      expect(apiError.status).toBe(entry.status);
      expect(apiError.message).toBe(entry.body.error.message);
    }
  });

  it('carries the optional field when present', async () => {
    const { client } = clientReturning(() =>
      jsonResponse(errorsFixture.invalid_config.body, 400)
    );
    const error = (await client
      .getHealth()
      .catch((caught: unknown) => caught)) as ApiError;
    expect(error.field).toBe('positions');
  });

  it('leaves field undefined when the envelope omits it', async () => {
    const { client } = clientReturning(() =>
      jsonResponse(errorsFixture.session_not_found.body, 404)
    );
    const error = (await client
      .getHealth()
      .catch((caught: unknown) => caught)) as ApiError;
    expect(error.field).toBeUndefined();
  });

  it('degrades an unknown code to internal_error', async () => {
    const { client } = clientReturning(() =>
      jsonResponse({ error: { code: 'teapot', message: 'nope' } }, 418)
    );
    const error = (await client
      .getHealth()
      .catch((caught: unknown) => caught)) as ApiError;
    expect(error.code).toBe('internal_error');
    expect(error.status).toBe(418);
    expect(error.message).toBe('nope');
  });

  it('degrades a non-JSON error body to internal_error', async () => {
    const { client } = clientReturning(
      () =>
        new Response('<html>502 Bad Gateway</html>', {
          status: 502,
          headers: { 'Content-Type': 'text/html' },
        })
    );
    const error = (await client
      .getHealth()
      .catch((caught: unknown) => caught)) as ApiError;
    expect(error.code).toBe('internal_error');
    expect(error.status).toBe(502);
  });

  it('degrades a JSON body with no envelope to internal_error', async () => {
    const { client } = clientReturning(() => jsonResponse({ oops: true }, 500));
    const error = (await client
      .getHealth()
      .catch((caught: unknown) => caught)) as ApiError;
    expect(error.code).toBe('internal_error');
    expect(error.status).toBe(500);
  });

  it('wraps a transport failure rather than leaking a TypeError', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    const client = new LiveApiClient(
      BASE,
      fetchImpl as unknown as typeof fetch
    );
    const error = (await client
      .getHealth()
      .catch((caught: unknown) => caught)) as ApiError;
    expect(isApiError(error)).toBe(true);
    expect(error.code).toBe('internal_error');
    expect(error.status).toBe(0);
    expect(error.message).toBe('Failed to fetch');
  });
});
