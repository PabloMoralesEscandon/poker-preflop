/**
 * The api boundary. Everything outside this directory imports from here and
 * gets an {@link ApiClient} — never a concrete implementation, never a fixture.
 */

import type { ApiClient } from './client';
import { DEFAULT_API_BASE_URL, LiveApiClient } from './live';
import { MockApiClient } from './mock';

export type ApiMode = 'mock' | 'live';

/**
 * Live is the default: the real server is the product, and a frontend that
 * silently falls back to fixtures would hide an outage behind plausible data.
 * Only an explicit `mock` opts out.
 *
 * Pure, so the "unset" case is testable — reading the environment happens in
 * {@link currentApiMode}.
 */
export function resolveApiMode(raw: string | undefined): ApiMode {
  return raw === 'mock' ? 'mock' : 'live';
}

export function currentApiMode(): ApiMode {
  return resolveApiMode(import.meta.env.VITE_API_MODE);
}

export function createApiClient(mode: ApiMode = currentApiMode()): ApiClient {
  if (mode === 'live') {
    return new LiveApiClient(
      import.meta.env.VITE_API_BASE_URL ?? DEFAULT_API_BASE_URL
    );
  }
  return new MockApiClient();
}

/** The client the app uses. Tests construct their own instead. */
export const apiClient: ApiClient = createApiClient();

export { ApiError, isApiError, type ApiClient } from './client';
export { DEFAULT_API_BASE_URL } from './live';
export * from './types';
