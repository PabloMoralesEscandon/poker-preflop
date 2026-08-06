import { describe, expect, it } from 'vitest';

import type { AnswerResponse } from '@/api';
import { gradeCell, withFold } from '@/api/grading';
import { MockApiClient } from '@/api/mock';
import { isMissInMixedSpot, verdictOf } from '@/lib/verdict';

/**
 * The worked-example table in API-CONTRACT §4.3, transcribed row for row.
 *
 * That section used to contradict itself; these rows are what pinned it down,
 * so they are asserted directly rather than incidentally. Two of them use
 * frequencies no current chart contains, which is exactly why the rule is a
 * pure function instead of only reachable through a session.
 */

const ACTIONS = ['raise', 'limp'];

interface Row {
  cell: Record<string, number>;
  chose: string;
  correct: boolean;
  mixed: boolean;
  expected: string;
  frequency: number;
}

const TABLE: Row[] = [
  {
    cell: { raise: 1.0 },
    chose: 'raise',
    correct: true,
    mixed: false,
    expected: 'raise',
    frequency: 1.0,
  },
  {
    cell: { raise: 1.0 },
    chose: 'fold',
    correct: false,
    mixed: false,
    expected: 'raise',
    frequency: 1.0,
  },
  {
    cell: {},
    chose: 'fold',
    correct: true,
    mixed: false,
    expected: 'fold',
    frequency: 1.0,
  },
  {
    cell: {},
    chose: 'raise',
    correct: false,
    mixed: false,
    expected: 'fold',
    frequency: 1.0,
  },
  {
    cell: { raise: 0.25 },
    chose: 'raise',
    correct: true,
    mixed: true,
    expected: 'fold',
    frequency: 0.75,
  },
  {
    cell: { raise: 0.25 },
    chose: 'fold',
    correct: true,
    mixed: true,
    expected: 'fold',
    frequency: 0.75,
  },
  {
    cell: { raise: 0.25 },
    chose: 'limp',
    correct: false,
    mixed: true,
    expected: 'fold',
    frequency: 0.75,
  },
  {
    cell: { raise: 0.4, limp: 0.6 },
    chose: 'raise',
    correct: true,
    mixed: true,
    expected: 'limp',
    frequency: 0.6,
  },
];

describe('API-CONTRACT §4.3 worked examples', () => {
  for (const row of TABLE) {
    it(`${JSON.stringify(row.cell)} + ${row.chose} → correct ${row.correct}, mixed ${row.mixed}, expected ${row.expected} ${row.frequency}`, () => {
      const result = gradeCell(row.cell, ACTIONS, row.chose);

      expect(result.correct).toBe(row.correct);
      expect(result.mixed).toBe(row.mixed);
      expect(result.expectedActionId).toBe(row.expected);
      expect(result.expectedFrequency).toBe(row.frequency);
    });
  }
});

describe('the rules the table encodes', () => {
  it('treats fold as an action with frequency 1 - sum(cell)', () => {
    expect(withFold({})).toEqual({ fold: 1 });
    expect(withFold({ raise: 1 })).toEqual({ raise: 1, fold: 0 });
    expect(withFold({ raise: 0.25 })).toEqual({ raise: 0.25, fold: 0.75 });
    expect(withFold({ raise: 0.4, limp: 0.6 })).toEqual({
      raise: 0.4,
      limp: 0.6,
      fold: 0,
    });
  });

  it('rounds away float noise in the fold frequency', () => {
    // 1 - (0.4 + 0.3) is 0.30000000000000004 in binary floating point.
    expect(withFold({ raise: 0.4, limp: 0.3 })['fold']).toBe(0.3);
  });

  it('marks any line the chart ever takes as correct', () => {
    for (const chose of ['raise', 'limp', 'fold']) {
      expect(gradeCell({ raise: 0.4, limp: 0.3 }, ACTIONS, chose).correct).toBe(
        true
      );
    }
  });

  it('marks a line the chart never takes as incorrect, mixed or not', () => {
    expect(gradeCell({ raise: 0.25 }, ACTIONS, 'limp').correct).toBe(false);
    expect(gradeCell({ raise: 1 }, ACTIONS, 'limp').correct).toBe(false);
  });

  it('is mixed only when more than one action has non-zero frequency', () => {
    expect(gradeCell({ raise: 1 }, ACTIONS, 'raise').mixed).toBe(false);
    expect(gradeCell({}, ACTIONS, 'fold').mixed).toBe(false);
    expect(gradeCell({ raise: 0.4, limp: 0.6 }, ACTIONS, 'raise').mixed).toBe(
      true
    );
    expect(gradeCell({ raise: 0.5 }, ACTIONS, 'raise').mixed).toBe(true);
  });

  it('picks the highest-frequency action, fold included', () => {
    expect(
      gradeCell({ raise: 0.4, limp: 0.3 }, ACTIONS, 'raise')
    ).toMatchObject({ expectedActionId: 'raise', expectedFrequency: 0.4 });
    expect(
      gradeCell({ raise: 0.3, limp: 0.2 }, ACTIONS, 'raise')
    ).toMatchObject({ expectedActionId: 'fold', expectedFrequency: 0.5 });
  });

  it('breaks ties by the actions list, with fold last', () => {
    expect(
      gradeCell({ raise: 0.5, limp: 0.5 }, ['raise', 'limp'], 'raise')
        .expectedActionId
    ).toBe('raise');
    expect(
      gradeCell({ raise: 0.5, limp: 0.5 }, ['limp', 'raise'], 'raise')
        .expectedActionId
    ).toBe('limp');
    // Fold ties the played half, and loses.
    expect(gradeCell({ raise: 0.5 }, ['raise'], 'raise').expectedActionId).toBe(
      'raise'
    );
  });
});

describe('the mock applies the same rule end to end', () => {
  it('grades a session hand exactly as the pure rule does', async () => {
    const client = new MockApiClient();
    const range = await client.getRange('rfi_6max_SB');

    const session = await client.createSession({
      drill_id: 'rfi',
      config: {
        table_format: '6max',
        positions: ['SB'],
        question_count: 60,
        weighting: 'uniform',
      },
      seed: 21,
    });

    for (let i = 0; i < 60; i += 1) {
      const next = await client.getNextQuestion(session.session_id);
      if (next.done) break;

      const notation = next.question.prompt.hand.notation;
      const chose = next.question.actions[i % next.question.actions.length]!.id;
      const answer = await client.submitAnswer(session.session_id, {
        question_id: next.question.question_id,
        action_id: chose,
      });

      const rule = gradeCell(range.grid[notation] ?? {}, range.actions, chose);
      expect(answer.correct).toBe(rule.correct);
      expect(answer.mixed ?? false).toBe(rule.mixed);
      expect(answer.expected.action_id).toBe(rule.expectedActionId);
      expect(answer.expected.frequency).toBe(rule.expectedFrequency);
    }
  });

  it('omits mixed entirely on a pure hand rather than sending false', async () => {
    const client = new MockApiClient();
    const session = await client.createSession({
      drill_id: 'rfi',
      config: {
        table_format: '6max',
        positions: ['CO'],
        question_count: 40,
        weighting: 'uniform',
      },
      seed: 5,
    });

    for (let i = 0; i < 40; i += 1) {
      const next = await client.getNextQuestion(session.session_id);
      if (next.done) break;
      const answer = await client.submitAnswer(session.session_id, {
        question_id: next.question.question_id,
        action_id: 'fold',
      });
      if (!answer.mixed) expect(answer).not.toHaveProperty('mixed');
    }
  });
});

describe('the UI verdict for each combination of the two flags', () => {
  const base = {
    chosen: { action_id: 'limp', label: 'Limp 1bb' },
    expected: { action_id: 'fold', label: 'Fold', frequency: 0.75 },
    explanation: { summary: '', detail: '', range_id: 'rfi_6max_SB' },
    progress: { answered: 1, correct: 0, total: 10 },
  } satisfies Omit<AnswerResponse, 'correct'>;

  it('reads a plain right answer as correct', () => {
    expect(verdictOf({ ...base, correct: true })).toBe('correct');
  });

  it('reads a plain wrong answer as incorrect', () => {
    expect(verdictOf({ ...base, correct: false })).toBe('incorrect');
  });

  it('reads an acceptable line in a split spot as mixed', () => {
    expect(verdictOf({ ...base, correct: true, mixed: true })).toBe('mixed');
  });

  /**
   * The case the contract rewrite called out: `mixed` and `correct` are
   * independent, and a wrong line in a mixed spot must not read as acceptable.
   */
  it('reads a line the chart never takes as incorrect even when mixed', () => {
    const answer = { ...base, correct: false, mixed: true };
    expect(verdictOf(answer)).toBe('incorrect');
    expect(isMissInMixedSpot(answer)).toBe(true);
  });

  it('flags the mixed-miss only for that one combination', () => {
    expect(isMissInMixedSpot({ ...base, correct: true, mixed: true })).toBe(
      false
    );
    expect(isMissInMixedSpot({ ...base, correct: false })).toBe(false);
    expect(isMissInMixedSpot({ ...base, correct: true })).toBe(false);
  });
});
