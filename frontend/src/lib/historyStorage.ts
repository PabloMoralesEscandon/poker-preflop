import {
  appendSession,
  HISTORY_STORAGE_KEY,
  parseHistory,
  type StoredSession,
} from './history';

/**
 * The side-effectful half of session history: everything that touches
 * `localStorage`. The rules live in `history.ts`; this only moves strings.
 *
 * Every entry point is failure-tolerant. Storage throws in more situations than
 * people expect — private browsing, a full quota, a hardened profile that
 * denies access outright — and none of them are worth losing the app over.
 */

export interface HistoryStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function defaultStorage(): HistoryStorage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    // Access itself can throw when storage is blocked by policy.
    return null;
  }
}

export function loadHistory(
  storage: HistoryStorage | null = defaultStorage()
): StoredSession[] {
  if (!storage) return [];
  try {
    return parseHistory(storage.getItem(HISTORY_STORAGE_KEY));
  } catch {
    return [];
  }
}

/** Returns the history as it now stands, whether or not the write succeeded. */
export function saveSession(
  entry: StoredSession,
  storage: HistoryStorage | null = defaultStorage()
): StoredSession[] {
  const next = appendSession(loadHistory(storage), entry);
  if (!storage) return next;
  try {
    storage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Quota or a denied write. The session still happened; only the record of
    // it is lost, and that must not interrupt the user.
  }
  return next;
}

export function clearHistory(
  storage: HistoryStorage | null = defaultStorage()
): void {
  if (!storage) return;
  try {
    storage.removeItem(HISTORY_STORAGE_KEY);
  } catch {
    // Nothing useful to do; the next read will simply return what is there.
  }
}
