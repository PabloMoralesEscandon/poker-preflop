import { describe, expect, it } from 'vitest';

import {
  HISTORY_STORAGE_KEY,
  HISTORY_VERSION,
  type StoredSession,
} from '@/lib/history';
import {
  clearHistory,
  loadHistory,
  saveSession,
  type HistoryStorage,
} from '@/lib/historyStorage';

function fakeStorage(initial: string | null = null): HistoryStorage & {
  value: string | null;
} {
  return {
    value: initial,
    getItem() {
      return this.value;
    },
    setItem(_key: string, next: string) {
      this.value = next;
    },
    removeItem() {
      this.value = null;
    },
  };
}

/** Storage that fails the way a full quota or a locked-down profile does. */
function hostileStorage(mode: 'read' | 'write' | 'both'): HistoryStorage {
  return {
    getItem() {
      if (mode === 'read' || mode === 'both') throw new Error('denied');
      return null;
    },
    setItem() {
      if (mode === 'write' || mode === 'both') {
        throw new Error('QuotaExceededError');
      }
    },
    removeItem() {
      throw new Error('denied');
    },
  };
}

const entry: StoredSession = {
  version: HISTORY_VERSION,
  drill_id: 'rfi',
  config: { table_format: '6max' },
  completed_at: '2026-08-07T12:00:00Z',
  answered: 10,
  correct: 7,
  breakdown: [{ key: 'CO', label: 'Cutoff', answered: 10, correct: 7 }],
};

describe('history storage round trip', () => {
  it('writes under the versioned key and reads back', () => {
    const storage = fakeStorage();
    saveSession(entry, storage);

    expect(storage.value).not.toBeNull();
    expect(loadHistory(storage)).toEqual([entry]);
  });

  it('accumulates sessions, newest first', () => {
    const storage = fakeStorage();
    saveSession({ ...entry, completed_at: '2026-08-01T00:00:00Z' }, storage);
    saveSession({ ...entry, completed_at: '2026-08-07T00:00:00Z' }, storage);

    expect(loadHistory(storage).map((e) => e.completed_at)).toEqual([
      '2026-08-07T00:00:00Z',
      '2026-08-01T00:00:00Z',
    ]);
  });

  it('clears', () => {
    const storage = fakeStorage();
    saveSession(entry, storage);
    clearHistory(storage);
    expect(loadHistory(storage)).toEqual([]);
  });
});

describe('history storage when the payload is bad', () => {
  it('reads corrupt JSON as empty rather than throwing', () => {
    expect(loadHistory(fakeStorage('}{not json'))).toEqual([]);
  });

  it('discards a payload written by an older version', () => {
    const stale = JSON.stringify([{ ...entry, version: HISTORY_VERSION - 1 }]);
    expect(loadHistory(fakeStorage(stale))).toEqual([]);
  });

  it('overwrites a corrupt payload on the next save instead of compounding it', () => {
    const storage = fakeStorage('garbage');
    saveSession(entry, storage);
    expect(loadHistory(storage)).toEqual([entry]);
  });
});

/**
 * Storage throws in more situations than people expect: private browsing, a
 * full quota, a profile that denies access outright. None may reach the user.
 */
describe('history storage when the browser refuses', () => {
  it('survives a read that throws', () => {
    expect(() => loadHistory(hostileStorage('read'))).not.toThrow();
    expect(loadHistory(hostileStorage('read'))).toEqual([]);
  });

  it('survives a write that throws, and still reports the new list', () => {
    const result = saveSession(entry, hostileStorage('write'));
    expect(result).toEqual([entry]);
  });

  it('survives a clear that throws', () => {
    expect(() => clearHistory(hostileStorage('both'))).not.toThrow();
  });

  it('treats a missing storage object as empty rather than crashing', () => {
    expect(loadHistory(null)).toEqual([]);
    expect(saveSession(entry, null)).toEqual([entry]);
    expect(() => clearHistory(null)).not.toThrow();
  });
});

describe('the storage key', () => {
  it('carries the version, so a future shape gets its own namespace', () => {
    expect(HISTORY_STORAGE_KEY).toContain(`v${HISTORY_VERSION}`);
  });
});
