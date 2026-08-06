/**
 * The api boundary. Everything outside this directory imports from here and
 * gets an {@link ApiClient} — never a concrete implementation, never a fixture.
 */

import type { ApiClient } from './client';
import { DEFAULT_API_BASE_URL, LiveApiClient } from './live';
import { MockApiClient } from './mock';

export type ApiMode = 'mock' | 'live';

/** Mock is the default so the app runs with no backend at all. */
export function resolveApiMode(
  raw: string | undefined = import.meta.env.VITE_API_MODE
): ApiMode {
  return raw === 'live' ? 'live' : 'mock';
}

export function createApiClient(mode: ApiMode = resolveApiMode()): ApiClient {
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
