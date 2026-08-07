import { describe, expect, it } from 'vitest';

import { createApiClient, currentApiMode, resolveApiMode } from '@/api';
import { LiveApiClient } from '@/api/live';
import { MockApiClient } from '@/api/mock';

/**
 * Which implementation the app picks. Live is the default as of PL-02: the real
 * server is the product, and falling back to fixtures on a misconfiguration
 * would hide an outage behind data that looks entirely plausible.
 */
describe('api mode resolution', () => {
  it('defaults to live when the variable is unset or empty', () => {
    expect(resolveApiMode(undefined)).toBe('live');
    expect(resolveApiMode('')).toBe('live');
  });

  it('uses mock only when explicitly asked', () => {
    expect(resolveApiMode('mock')).toBe('mock');
  });

  it('treats anything unrecognised as live rather than silently mocking', () => {
    for (const raw of ['live', 'LIVE', 'production', 'moc', 'true']) {
      expect(resolveApiMode(raw)).toBe('live');
    }
  });

  it('builds the implementation matching the mode', () => {
    expect(createApiClient('mock')).toBeInstanceOf(MockApiClient);
    expect(createApiClient('live')).toBeInstanceOf(LiveApiClient);
  });

  it('runs the test suite against the mock', () => {
    // vite.config.ts sets VITE_API_MODE=mock for tests, so nothing here can
    // accidentally depend on a server being up.
    expect(currentApiMode()).toBe('mock');
  });
});
