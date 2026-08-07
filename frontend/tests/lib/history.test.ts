import { describe, expect, it } from 'vitest';

import summaryFixture from '@fixtures/summary.json';

import type { SessionSummary } from '@/api';
import {
  aggregate,
  appendSession,
  forDrill,
  HISTORY_LIMIT,
  HISTORY_VERSION,
  isStoredSession,
  parseHistory,
  toStoredSession,
  type StoredSession,
} from '@/lib/history';

const SUMMARY = summaryFixture as unknown as SessionSummary;

function session(
  overrides: Partial<StoredSession> = {},
  breakdown: [string, number, number][] = [['CO', 10, 8]]
): StoredSession {
  return {
    version: HISTORY_VERSION,
    drill_id: 'rfi',
    config: { table_format: '6max' },
    completed_at: '2026-08-07T12:00:00Z',
    answered: breakdown.reduce((sum, [, a]) => sum + a, 0),
    correct: breakdown.reduce((sum, [, , c]) => sum + c, 0),
    breakdown: breakdown.map(([key, answered, correct]) => ({
      key,
      label: key,
      answered,
      correct,
    })),
    ...overrides,
  };
}

describe('recording a finished session', () => {
  it('keeps the per-key counts and the config, and nothing else', () => {
    const stored = toStoredSession(
      SUMMARY,
      { table_format: '6max', question_count: 25 },
      '2026-08-07T12:00:00Z'
    );

    expect(stored.version).toBe(HISTORY_VERSION);
    expect(stored.drill_id).toBe('rfi');
    expect(stored.answered).toBe(25);
    expect(stored.correct).toBe(21);
    expect(stored.breakdown).toHaveLength(SUMMARY.breakdown.length);
    expect(stored.breakdown[0]).toEqual({
      key: 'UTG',
      label: 'UTG',
      answered: 5,
      correct: 3,
    });
  });

  it('never stores the question log', () => {
    const stored = toStoredSession(SUMMARY, {}, '2026-08-07T12:00:00Z');
    const serialised = JSON.stringify(stored);

    expect(stored).not.toHaveProperty('mistakes');
    expect(serialised).not.toContain('question_id');
    // A mistake's hand is part of the question log, not a per-key count.
    expect(serialised).not.toContain('K9s');
  });

  it('derives accuracy rather than storing it', () => {
    const stored = toStoredSession(SUMMARY, {}, '2026-08-07T12:00:00Z');
    expect(stored).not.toHaveProperty('accuracy');
  });
});

describe('the stored list', () => {
  it('puts the newest session first', () => {
    const older = session({ completed_at: '2026-08-01T00:00:00Z' });
    const newer = session({ completed_at: '2026-08-07T00:00:00Z' });
    const history = appendSession([older], newer);
    expect(history.map((entry) => entry.completed_at)).toEqual([
      '2026-08-07T00:00:00Z',
      '2026-08-01T00:00:00Z',
    ]);
  });

  it('caps the list, dropping the oldest', () => {
    let history: StoredSession[] = [];
    for (let i = 0; i < HISTORY_LIMIT + 10; i += 1) {
      history = appendSession(
        history,
        session({
          completed_at: `2026-08-07T00:00:${String(i).padStart(2, '0')}Z`,
        })
      );
    }
    expect(history).toHaveLength(HISTORY_LIMIT);
    expect(history[0]?.completed_at).toContain(':59Z');
  });

  it('filters to one drill', () => {
    const history = [session(), session({ drill_id: 'bb_defence' })];
    expect(forDrill(history, 'rfi')).toHaveLength(1);
    expect(forDrill(history, 'bb_defence')).toHaveLength(1);
    expect(forDrill(history, 'nope')).toHaveLength(0);
  });
});

/**
 * A corrupt or outdated payload costs the user a graph, not their data. It must
 * never cost them the app.
 */
describe('reading a payload that cannot be trusted', () => {
  it('returns empty for missing or unparseable storage', () => {
    expect(parseHistory(null)).toEqual([]);
    expect(parseHistory('')).toEqual([]);
    expect(parseHistory('not json at all')).toEqual([]);
    expect(parseHistory('{"almost": ')).toEqual([]);
  });

  it('returns empty when the payload is not an array', () => {
    expect(parseHistory('{"sessions":[]}')).toEqual([]);
    expect(parseHistory('42')).toEqual([]);
    expect(parseHistory('null')).toEqual([]);
    expect(parseHistory('"a string"')).toEqual([]);
  });

  it('discards entries from a different version', () => {
    const stale = { ...session(), version: HISTORY_VERSION + 1 };
    expect(parseHistory(JSON.stringify([stale]))).toEqual([]);
  });

  it('keeps the valid entries and drops only the malformed ones', () => {
    const payload = JSON.stringify([
      session({ completed_at: '2026-08-07T00:00:00Z' }),
      { version: HISTORY_VERSION, drill_id: 'rfi' },
      null,
      'nonsense',
      { ...session(), breakdown: [{ key: 'CO' }] },
      session({ completed_at: '2026-08-06T00:00:00Z' }),
    ]);
    const history = parseHistory(payload);
    expect(history).toHaveLength(2);
    expect(history.map((entry) => entry.completed_at)).toEqual([
      '2026-08-07T00:00:00Z',
      '2026-08-06T00:00:00Z',
    ]);
  });

  it('rejects entries with non-numeric counts', () => {
    expect(isStoredSession({ ...session(), answered: '10' })).toBe(false);
    expect(isStoredSession({ ...session(), correct: null })).toBe(false);
    expect(isStoredSession({ ...session(), breakdown: 'nope' })).toBe(false);
    expect(isStoredSession({ ...session(), config: null })).toBe(false);
  });
});

describe('aggregating across sessions', () => {
  const history = [
    // Newest first, as stored.
    session({ completed_at: '2026-08-07T00:00:00Z' }, [
      ['CO', 10, 9],
      ['SB', 10, 2],
    ]),
    session({ completed_at: '2026-08-06T00:00:00Z' }, [
      ['CO', 10, 7],
      ['SB', 10, 4],
    ]),
  ];

  it('totals every session', () => {
    const summary = aggregate(history);
    expect(summary.sessions).toBe(2);
    expect(summary.answered).toBe(40);
    expect(summary.correct).toBe(22);
    expect(summary.accuracy).toBeCloseTo(22 / 40, 6);
  });

  it('rolls each key up across sessions', () => {
    const byKey = Object.fromEntries(
      aggregate(history).byKey.map((stat) => [stat.key, stat])
    );
    expect(byKey['CO']).toMatchObject({ answered: 20, correct: 16 });
    expect(byKey['SB']).toMatchObject({ answered: 20, correct: 6 });
    expect(byKey['CO']?.accuracy).toBeCloseTo(0.8, 6);
  });

  it('orders keys worst first, which is what the reader wants', () => {
    expect(aggregate(history).byKey.map((stat) => stat.key)).toEqual([
      'SB',
      'CO',
    ]);
  });

  it('reports the trend oldest first', () => {
    expect(aggregate(history).trend).toEqual([
      { completed_at: '2026-08-06T00:00:00Z', accuracy: 0.55 },
      { completed_at: '2026-08-07T00:00:00Z', accuracy: 0.55 },
    ]);
  });

  it('withholds a "weakest" verdict until the sample is big enough', () => {
    const thin = [session({}, [['SB', 2, 0]])];
    expect(aggregate(thin).byKey).toHaveLength(1);
    expect(aggregate(thin).weakest).toHaveLength(0);
    expect(aggregate(thin, 2).weakest).toHaveLength(1);
  });

  it('ignores keys that were configured but never drilled', () => {
    const summary = aggregate([
      session({}, [
        ['CO', 10, 8],
        ['BTN', 0, 0],
      ]),
    ]);
    expect(summary.byKey.map((stat) => stat.key)).toEqual(['CO']);
  });

  it('takes the most recent label when a key is relabelled', () => {
    const history = [
      {
        ...session({ completed_at: '2026-08-07T00:00:00Z' }),
        breakdown: [{ key: 'CO', label: 'Cutoff', answered: 5, correct: 5 }],
      },
      {
        ...session({ completed_at: '2026-08-01T00:00:00Z' }),
        breakdown: [{ key: 'CO', label: 'CO', answered: 5, correct: 0 }],
      },
    ];
    expect(aggregate(history).byKey[0]?.label).toBe('Cutoff');
  });

  it('handles an empty history without dividing by zero', () => {
    const summary = aggregate([]);
    expect(summary).toMatchObject({
      sessions: 0,
      answered: 0,
      correct: 0,
      accuracy: 0,
    });
    expect(summary.byKey).toEqual([]);
    expect(summary.trend).toEqual([]);
  });

  /** The hard constraint: nothing here knows what a position is. */
  it('aggregates keys from a drill it has never heard of', () => {
    const other = [
      session({ drill_id: 'bb_defence' }, [
        ['vs_btn_open', 12, 3],
        ['vs_co_open', 12, 11],
      ]),
    ];
    const summary = aggregate(other);
    expect(summary.byKey.map((stat) => stat.key)).toEqual([
      'vs_btn_open',
      'vs_co_open',
    ]);
    expect(summary.weakest[0]?.key).toBe('vs_btn_open');
  });
});
