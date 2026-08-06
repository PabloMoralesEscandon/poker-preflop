import { describe, expect, it } from 'vitest';

import { ApiError } from '@/api/client';
import { MockApiClient } from '@/api/mock';
import type { CreateSessionRequest, Question } from '@/api/types';

const BASE_CONFIG: CreateSessionRequest = {
  drill_id: 'rfi',
  config: {
    table_format: '6max',
    positions: ['UTG', 'HJ', 'CO', 'BTN', 'SB'],
    question_count: 6,
    weighting: 'borderline',
  },
  seed: 12345,
};

async function startSession(overrides: Partial<CreateSessionRequest> = {}) {
  const client = new MockApiClient();
  const session = await client.createSession({ ...BASE_CONFIG, ...overrides });
  return { client, session };
}

async function currentQuestion(
  client: MockApiClient,
  sessionId: string
): Promise<Question> {
  const next = await client.getNextQuestion(sessionId);
  if (next.done) throw new Error('session is already complete');
  return next.question;
}

describe('mock session lifecycle', () => {
  it('creates a session that echoes the config and the seed', async () => {
    const { session } = await startSession();
    expect(session.drill_id).toBe('rfi');
    expect(session.seed).toBe(12345);
    expect(session.config['question_count']).toBe(6);
    expect(session.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T[\d:]+Z$/);
  });

  it('fills in defaults for omitted config fields', async () => {
    const { session } = await startSession({ config: {} });
    expect(session.config['table_format']).toBe('6max');
    expect(session.config['question_count']).toBe(25);
    expect(session.config['weighting']).toBe('borderline');
  });

  it('generates a seed when one is not supplied', async () => {
    const client = new MockApiClient();
    const session = await client.createSession({
      drill_id: 'rfi',
      config: BASE_CONFIG.config,
    });
    expect(typeof session.seed).toBe('number');
  });

  it('is idempotent: next returns the same question until it is answered', async () => {
    const { client, session } = await startSession();
    const first = await currentQuestion(client, session.session_id);
    const again = await currentQuestion(client, session.session_id);
    expect(again).toEqual(first);

    await client.submitAnswer(session.session_id, {
      question_id: first.question_id,
      action_id: 'fold',
    });
    const third = await currentQuestion(client, session.session_id);
    expect(third.question_id).not.toBe(first.question_id);
  });

  it('serves exactly question_count questions and then reports done', async () => {
    const { client, session } = await startSession();
    const seen: Question[] = [];

    for (let i = 0; i < 6; i += 1) {
      const question = await currentQuestion(client, session.session_id);
      expect(question.index).toBe(i + 1);
      expect(question.total).toBe(6);
      expect(question.question_id).toBe(`q_${i + 1}`);
      seen.push(question);
      await client.submitAnswer(session.session_id, {
        question_id: question.question_id,
        action_id: 'raise',
      });
    }

    const next = await client.getNextQuestion(session.session_id);
    expect(next).toEqual({ done: true, question: null });
    expect(seen).toHaveLength(6);
  });

  it('emits prompts that match the contract shape', async () => {
    const { client, session } = await startSession();
    const question = await currentQuestion(client, session.session_id);

    expect(question.drill_id).toBe('rfi');
    expect(question.prompt.kind).toBe('rfi');
    expect(question.prompt.stack_bb).toBe(100);
    expect(question.prompt.pot_bb).toBe(1.5);
    expect(question.prompt.hand.cards).toHaveLength(2);
    expect(question.prompt.hand.cards[0]).not.toBe(
      question.prompt.hand.cards[1]
    );
    expect(['UTG', 'HJ', 'CO', 'BTN', 'SB']).toContain(
      question.prompt.hero_position
    );
    expect(question.prompt.folded_before).not.toContain(
      question.prompt.hero_position
    );
    // Fold is always offered and always first; the rest come from the range's
    // own action list, which is three-wide at the small blind.
    expect(question.actions[0]?.id).toBe('fold');
    expect(question.actions.length).toBeGreaterThanOrEqual(2);
  });

  it('offers three actions at the small blind and two elsewhere', async () => {
    const client = new MockApiClient();

    const sb = await client.createSession({
      drill_id: 'rfi',
      config: { ...BASE_CONFIG.config, positions: ['SB'] },
      seed: 4,
    });
    const sbQuestion = await currentQuestion(client, sb.session_id);
    expect(sbQuestion.actions.map((a) => a.id)).toEqual([
      'fold',
      'raise',
      'limp',
    ]);
    // Labels are server-provided; the SB opens larger (RFI-CALIBRATION §2.2).
    expect(sbQuestion.actions.map((a) => a.label)).toEqual([
      'Fold',
      'Raise 3bb',
      'Limp 1bb',
    ]);

    const co = await client.createSession({
      drill_id: 'rfi',
      config: { ...BASE_CONFIG.config, positions: ['CO'] },
      seed: 4,
    });
    const coQuestion = await currentQuestion(client, co.session_id);
    expect(coQuestion.actions.map((a) => a.id)).toEqual(['fold', 'raise']);
    expect(coQuestion.actions[1]?.label).toBe('Raise 2.5bb');
  });

  it('replays identically for the same seed', async () => {
    const runOne = await drainSession(12345);
    const runTwo = await drainSession(12345);
    const runThree = await drainSession(999);

    expect(runOne).toEqual(runTwo);
    expect(runOne).not.toEqual(runThree);
  });

  it('varies the hand it asks about', async () => {
    const { client, session } = await startSession({
      config: { ...BASE_CONFIG.config, question_count: 20 },
    });
    const notations = new Set<string>();
    for (let i = 0; i < 20; i += 1) {
      const question = await currentQuestion(client, session.session_id);
      notations.add(question.prompt.hand.notation);
      await client.submitAnswer(session.session_id, {
        question_id: question.question_id,
        action_id: 'fold',
      });
    }
    expect(notations.size).toBeGreaterThan(5);
  });
});

async function drainSession(seed: number): Promise<string[]> {
  const { client, session } = await startSession({ seed });
  const trace: string[] = [];
  for (let i = 0; i < 6; i += 1) {
    const question = await currentQuestion(client, session.session_id);
    trace.push(
      `${question.prompt.hero_position}:${question.prompt.hand.notation}:${question.prompt.hand.cards.join('')}`
    );
    await client.submitAnswer(session.session_id, {
      question_id: question.question_id,
      action_id: 'raise',
    });
  }
  return trace;
}

describe('mock grading', () => {
  it('grades against the chart, so feedback varies by hand', async () => {
    const { client, session } = await startSession({
      config: { ...BASE_CONFIG.config, question_count: 30 },
    });

    const results: { correct: boolean; summary: string }[] = [];
    for (let i = 0; i < 30; i += 1) {
      const question = await currentQuestion(client, session.session_id);
      const answer = await client.submitAnswer(session.session_id, {
        question_id: question.question_id,
        action_id: 'raise',
      });
      results.push({
        correct: answer.correct,
        summary: answer.explanation.summary,
      });
    }

    // Always answering "raise" must produce both outcomes against a real chart.
    expect(results.some((r) => r.correct)).toBe(true);
    expect(results.some((r) => !r.correct)).toBe(true);
    expect(new Set(results.map((r) => r.summary)).size).toBeGreaterThan(3);
  });

  it('reports a mixed hand as acceptable whichever action is chosen', async () => {
    // K5s is 0.5 in the fixture chart; both answers are acceptable.
    for (const actionId of ['fold', 'raise']) {
      const answer = await answerFor('K5s', actionId);
      expect(answer.correct).toBe(true);
      expect(answer.mixed).toBe(true);
      expect(answer.explanation.summary).toContain('mixed');
    }
  });

  it('marks a pure open answered as fold incorrect', async () => {
    const answer = await answerFor('AA', 'fold');
    expect(answer.correct).toBe(false);
    expect(answer.mixed).toBeUndefined();
    expect(answer.expected.action_id).toBe('raise');
    expect(answer.expected.frequency).toBe(1);
  });

  it('marks a pure fold answered as fold correct, with fold frequency 1', async () => {
    const answer = await answerFor('72o', 'fold');
    expect(answer.correct).toBe(true);
    expect(answer.expected.action_id).toBe('fold');
    expect(answer.expected.frequency).toBe(1);
  });

  it('tracks progress across the session', async () => {
    const { client, session } = await startSession();
    for (let i = 0; i < 3; i += 1) {
      const question = await currentQuestion(client, session.session_id);
      const answer = await client.submitAnswer(session.session_id, {
        question_id: question.question_id,
        action_id: 'fold',
      });
      expect(answer.progress.answered).toBe(i + 1);
      expect(answer.progress.total).toBe(6);
      expect(answer.progress.correct).toBeLessThanOrEqual(i + 1);
    }
  });
});

/**
 * Drills seeded sessions until the requested notation comes up, then answers
 * it. Grading is a pure function of the hand, so this isolates one chart cell.
 * Seeds are fixed, so the search is deterministic rather than flaky.
 */
async function answerFor(notation: string, actionId: string) {
  const client = new MockApiClient();
  const questionCount = 200;

  for (let seed = 1; seed <= 40; seed += 1) {
    const session = await client.createSession({
      drill_id: 'rfi',
      config: {
        table_format: '6max',
        positions: ['CO'],
        question_count: questionCount,
        weighting: 'uniform',
      },
      seed,
    });

    for (let i = 0; i < questionCount; i += 1) {
      const question = await currentQuestion(client, session.session_id);
      if (question.prompt.hand.notation === notation) {
        return client.submitAnswer(session.session_id, {
          question_id: question.question_id,
          action_id: actionId,
        });
      }
      await client.submitAnswer(session.session_id, {
        question_id: question.question_id,
        action_id: 'fold',
      });
    }
  }
  throw new Error(`${notation} never came up`);
}

describe('mock summary', () => {
  it('accumulates accuracy, a per-position breakdown and the mistakes', async () => {
    const { client, session } = await startSession({
      config: { ...BASE_CONFIG.config, question_count: 12 },
    });

    for (let i = 0; i < 12; i += 1) {
      const question = await currentQuestion(client, session.session_id);
      await client.submitAnswer(session.session_id, {
        question_id: question.question_id,
        action_id: i % 2 === 0 ? 'raise' : 'fold',
      });
    }

    const summary = await client.getSummary(session.session_id);
    expect(summary.session_id).toBe(session.session_id);
    expect(summary.answered).toBe(12);
    expect(summary.complete).toBe(true);
    expect(summary.accuracy).toBeCloseTo(summary.correct / 12, 4);
    expect(summary.mistakes).toHaveLength(12 - summary.correct);

    const totalAnswered = summary.breakdown.reduce(
      (sum, row) => sum + row.answered,
      0
    );
    expect(totalAnswered).toBe(12);
    for (const row of summary.breakdown) {
      expect(row.label).not.toBe('');
      expect(row.accuracy).toBeCloseTo(row.correct / row.answered, 4);
    }
  });

  it('is available mid-session and reports incomplete', async () => {
    const { client, session } = await startSession();
    const question = await currentQuestion(client, session.session_id);
    await client.submitAnswer(session.session_id, {
      question_id: question.question_id,
      action_id: 'fold',
    });

    const summary = await client.getSummary(session.session_id);
    expect(summary.answered).toBe(1);
    expect(summary.complete).toBe(false);
  });
});

describe('mock errors', () => {
  it('404s an unknown session', async () => {
    const client = new MockApiClient();
    await expect(client.getNextQuestion('nope')).rejects.toMatchObject({
      code: 'session_not_found',
      status: 404,
    });
  });

  it('404s an unknown drill', async () => {
    const client = new MockApiClient();
    await expect(
      client.createSession({ drill_id: 'nope', config: {} })
    ).rejects.toMatchObject({ code: 'drill_not_found', status: 404 });
  });

  it('409s an out-of-order answer', async () => {
    const { client, session } = await startSession();
    await currentQuestion(client, session.session_id);
    await expect(
      client.submitAnswer(session.session_id, {
        question_id: 'q_99',
        action_id: 'fold',
      })
    ).rejects.toMatchObject({ code: 'question_out_of_order', status: 409 });
  });

  it('409s answering the same question twice', async () => {
    const { client, session } = await startSession();
    const question = await currentQuestion(client, session.session_id);
    await client.submitAnswer(session.session_id, {
      question_id: question.question_id,
      action_id: 'fold',
    });
    await expect(
      client.submitAnswer(session.session_id, {
        question_id: question.question_id,
        action_id: 'fold',
      })
    ).rejects.toMatchObject({
      code: 'question_already_answered',
      status: 409,
    });
  });

  it('400s an invalid config, naming the field', async () => {
    const client = new MockApiClient();
    await expect(
      client.createSession({
        drill_id: 'rfi',
        config: { ...BASE_CONFIG.config, positions: [] },
      })
    ).rejects.toMatchObject({
      code: 'invalid_config',
      status: 400,
      field: 'positions',
    });

    await expect(
      client.createSession({
        drill_id: 'rfi',
        config: { ...BASE_CONFIG.config, question_count: 1 },
      })
    ).rejects.toMatchObject({
      code: 'invalid_config',
      field: 'question_count',
    });

    await expect(
      client.createSession({
        drill_id: 'rfi',
        config: { ...BASE_CONFIG.config, table_format: 'heads_up' },
      })
    ).rejects.toMatchObject({
      code: 'invalid_config',
      field: 'table_format',
    });
  });

  it('400s an action that is not on the question', async () => {
    const { client, session } = await startSession();
    const question = await currentQuestion(client, session.session_id);
    await expect(
      client.submitAnswer(session.session_id, {
        question_id: question.question_id,
        action_id: 'shove',
      })
    ).rejects.toBeInstanceOf(ApiError);
  });
});

describe('mock static endpoints', () => {
  it('serves the drills fixture', async () => {
    const client = new MockApiClient();
    const { drills } = await client.listDrills();
    expect(drills.map((drill) => drill.id)).toEqual(['rfi']);
    expect(drills[0]?.config_schema.fields.map((f) => f.key)).toEqual([
      'table_format',
      'positions',
      'question_count',
      'weighting',
    ]);
  });

  it('filters the range list', async () => {
    const client = new MockApiClient();
    const all = await client.listRanges();
    expect(all.ranges.length).toBeGreaterThan(0);

    const nine = await client.listRanges({ table_format: '9max' });
    expect(nine.ranges).toHaveLength(0);

    const rfi = await client.listRanges({ spot: 'rfi' });
    expect(rfi.ranges).toEqual(all.ranges);
  });

  it('serves a complete 169-key grid', async () => {
    const client = new MockApiClient();
    const range = await client.getRange('rfi_6max_CO');
    expect(Object.keys(range.grid)).toHaveLength(169);
    expect(range.actions).toEqual(['raise']);
    expect(range.stats.hands_played).toBeGreaterThan(0);
  });

  it('404s an unknown range', async () => {
    const client = new MockApiClient();
    await expect(client.getRange('rfi_6max_BB')).rejects.toMatchObject({
      code: 'range_not_found',
      status: 404,
    });
  });

  it('serves the small blind as a two-non-fold-action range', async () => {
    const client = new MockApiClient();
    const range = await client.getRange('rfi_6max_SB');

    expect(range.actions).toEqual(['raise', 'limp']);
    expect(range.open_size_bb).toBe(3);
    expect(Object.keys(range.grid)).toHaveLength(169);

    const actionIds = new Set(
      Object.values(range.grid).flatMap((cell) => Object.keys(cell))
    );
    expect(actionIds).toEqual(new Set(['raise', 'limp']));

    // Grid values only ever contain ids listed in `actions`
    // (RANGE-DATA-FORMAT §3.3).
    for (const id of actionIds) expect(range.actions).toContain(id);
  });

  it('grades against the same chart it serves for that position', async () => {
    const client = new MockApiClient();
    const range = await client.getRange('rfi_6max_SB');

    const session = await client.createSession({
      drill_id: 'rfi',
      config: { ...BASE_CONFIG.config, positions: ['SB'], question_count: 40 },
      seed: 11,
    });

    for (let i = 0; i < 40; i += 1) {
      const question = await currentQuestion(client, session.session_id);
      const answer = await client.submitAnswer(session.session_id, {
        question_id: question.question_id,
        action_id: 'limp',
      });

      const cell = range.grid[question.prompt.hand.notation] ?? {};
      const played = Object.values(cell).reduce((sum, v) => sum + v, 0);
      const expectedId =
        played >= 0.5
          ? (Object.entries(cell).sort(([, a], [, b]) => b - a)[0]?.[0] ??
            'fold')
          : 'fold';

      expect(answer.expected.action_id).toBe(expectedId);
      expect(answer.explanation.range_id).toBe('rfi_6max_SB');
    }
  });

  it('reports limp as the expected action where the chart limps', async () => {
    const client = new MockApiClient();
    const range = await client.getRange('rfi_6max_SB');
    const limped = Object.entries(range.grid).find(
      ([, cell]) => cell['limp'] === 1
    );
    expect(limped).toBeDefined();

    const session = await client.createSession({
      drill_id: 'rfi',
      config: { ...BASE_CONFIG.config, positions: ['SB'], question_count: 200 },
      seed: 3,
    });

    for (let i = 0; i < 200; i += 1) {
      const question = await currentQuestion(client, session.session_id);
      const isLimp = range.grid[question.prompt.hand.notation]?.['limp'] === 1;
      const answer = await client.submitAnswer(session.session_id, {
        question_id: question.question_id,
        action_id: 'limp',
      });
      if (isLimp) {
        expect(answer.correct).toBe(true);
        expect(answer.expected.action_id).toBe('limp');
        expect(answer.expected.label).toBe('Limp 1bb');
        return;
      }
    }
    throw new Error('no limp hand came up');
  });
});
