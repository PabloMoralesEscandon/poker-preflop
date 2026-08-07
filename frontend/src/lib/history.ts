import type { DrillConfig, SessionSummary } from '../api';

/**
 * Local session history: the pure half.
 *
 * Everything here is a total function over plain data — no storage, no clock,
 * no React — so the aggregation rules can be tested directly.
 *
 * Two constraints shape the design:
 *
 *  - **Generic over breakdown keys.** A `key` is an opaque string that the drill
 *    defines. Nothing here knows what a position is, so drill #2 aggregates
 *    correctly with no changes.
 *  - **No question log.** A finished session is stored as its per-key counts and
 *    nothing else. Individual hands are not our business to keep.
 */

export const HISTORY_STORAGE_KEY = 'learner.history.v1';

/** Bump when {@link StoredSession} changes shape. Old payloads are discarded. */
export const HISTORY_VERSION = 1;

/** Keep the store small and bounded; oldest entries fall off the end. */
export const HISTORY_LIMIT = 50;

/** A key needs this many answers before "weakest" says anything about it. */
export const MIN_SAMPLE = 5;

export interface StoredBreakdownRow {
  key: string;
  label: string;
  answered: number;
  correct: number;
}

export interface StoredSession {
  version: number;
  drill_id: string;
  config: DrillConfig;
  /** RFC 3339 UTC. */
  completed_at: string;
  answered: number;
  correct: number;
  breakdown: StoredBreakdownRow[];
}

export interface KeyStat {
  key: string;
  label: string;
  answered: number;
  correct: number;
  accuracy: number;
}

export interface HistorySummary {
  sessions: number;
  answered: number;
  correct: number;
  accuracy: number;
  /** Every key ever drilled, worst accuracy first. */
  byKey: KeyStat[];
  /** The subset of `byKey` with enough answers to draw a conclusion from. */
  weakest: KeyStat[];
  /** Oldest → newest, one point per session. */
  trend: { completed_at: string; accuracy: number }[];
}

function accuracyOf(correct: number, answered: number): number {
  return answered === 0 ? 0 : correct / answered;
}

/**
 * Converts a finished session into what we keep. Accuracy is deliberately not
 * stored — it is derived, and storing it invites the two disagreeing.
 */
export function toStoredSession(
  summary: SessionSummary,
  config: DrillConfig,
  completedAt: string
): StoredSession {
  return {
    version: HISTORY_VERSION,
    drill_id: summary.drill_id,
    config,
    completed_at: completedAt,
    answered: summary.answered,
    correct: summary.correct,
    breakdown: summary.breakdown.map((row) => ({
      key: row.key,
      label: row.label,
      answered: row.answered,
      correct: row.correct,
    })),
  };
}

function isRow(value: unknown): value is StoredBreakdownRow {
  if (typeof value !== 'object' || value === null) return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row['key'] === 'string' &&
    typeof row['label'] === 'string' &&
    Number.isFinite(row['answered']) &&
    Number.isFinite(row['correct'])
  );
}

export function isStoredSession(value: unknown): value is StoredSession {
  if (typeof value !== 'object' || value === null) return false;
  const entry = value as Record<string, unknown>;
  return (
    entry['version'] === HISTORY_VERSION &&
    typeof entry['drill_id'] === 'string' &&
    typeof entry['completed_at'] === 'string' &&
    typeof entry['config'] === 'object' &&
    entry['config'] !== null &&
    Number.isFinite(entry['answered']) &&
    Number.isFinite(entry['correct']) &&
    Array.isArray(entry['breakdown']) &&
    entry['breakdown'].every(isRow)
  );
}

/**
 * Reads a stored payload, keeping only entries that are still valid.
 *
 * Never throws. A corrupt string, a payload from an older version, or a single
 * malformed entry costs the user their history — which is a graph, not their
 * data — and is strictly better than a blank screen.
 */
export function parseHistory(raw: string | null): StoredSession[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(isStoredSession);
}

/** Newest first, capped. */
export function appendSession(
  history: readonly StoredSession[],
  entry: StoredSession,
  limit: number = HISTORY_LIMIT
): StoredSession[] {
  return [entry, ...history].slice(0, Math.max(limit, 0));
}

/** Only sessions for one drill; history is per-drill to stay comparable. */
export function forDrill(
  history: readonly StoredSession[],
  drillId: string
): StoredSession[] {
  return history.filter((entry) => entry.drill_id === drillId);
}

/**
 * Rolls sessions up per breakdown key.
 *
 * `history` is expected newest-first; `trend` is returned oldest-first because
 * that is the direction a reader expects to see time run.
 */
export function aggregate(
  history: readonly StoredSession[],
  minSample: number = MIN_SAMPLE
): HistorySummary {
  const byKey = new Map<string, KeyStat>();
  let answered = 0;
  let correct = 0;

  // Oldest first, so the newest session's label for a key wins.
  for (const session of [...history].reverse()) {
    answered += session.answered;
    correct += session.correct;

    for (const row of session.breakdown) {
      const stat = byKey.get(row.key) ?? {
        key: row.key,
        label: row.label,
        answered: 0,
        correct: 0,
        accuracy: 0,
      };
      stat.label = row.label;
      stat.answered += row.answered;
      stat.correct += row.correct;
      stat.accuracy = accuracyOf(stat.correct, stat.answered);
      byKey.set(row.key, stat);
    }
  }

  const keys = [...byKey.values()]
    .filter((stat) => stat.answered > 0)
    .sort((a, b) => a.accuracy - b.accuracy || b.answered - a.answered);

  return {
    sessions: history.length,
    answered,
    correct,
    accuracy: accuracyOf(correct, answered),
    byKey: keys,
    weakest: keys.filter((stat) => stat.answered >= minSample),
    trend: [...history].reverse().map((session) => ({
      completed_at: session.completed_at,
      accuracy: accuracyOf(session.correct, session.answered),
    })),
  };
}
