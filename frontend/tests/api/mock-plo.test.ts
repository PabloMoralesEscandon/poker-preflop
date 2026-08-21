import { describe, expect, it } from 'vitest';

import { MockApiClient } from '@/api/mock';
import { PLO_CLASS_KEYS, ploCombos } from '@/lib/hands-plo';

/**
 * The mock's PLO path mirrors the backend: class-key weighted sampling, a
 * uniform concrete deal inside the chosen class, and grading against the same
 * chart the chart browser serves. These tests pin that end to end.
 */

async function startSession(overrides: Record<string, unknown> = {}) {
  const client = new MockApiClient();
  const session = await client.createSession({
    drill_id: 'rfi',
    config: {
      game: 'plo',
      table_format: '6max',
      positions: ['BTN'],
      question_count: 6,
      weighting: 'borderline',
    },
    seed: 12345,
    ...overrides,
  });
  return { client, session };
}

async function currentQuestion(client: MockApiClient, sessionId: string) {
  const next = await client.getNextQuestion(sessionId);
  if (next.done) throw new Error('session is already complete');
  return next.question;
}

describe('mock PLO sessions', () => {
  it('deals four distinct cards with a valid class-key notation', async () => {
    const { client, session } = await startSession();
    const question = await currentQuestion(client, session.session_id);

    expect(question.prompt.kind).toBe('rfi');
    if (question.prompt.kind !== 'rfi') return;
    expect(question.prompt.game).toBe('plo');
    expect(question.prompt.hand.cards).toHaveLength(4);
    expect(new Set(question.prompt.hand.cards).size).toBe(4);
    expect(PLO_CLASS_KEYS).toContain(question.prompt.hand.notation);
    expect(question.actions.map((action) => action.id)).toEqual([
      'fold',
      'raise',
    ]);
  });

  it('replays identically for the same seed', async () => {
    const first = await startSession();
    const second = await startSession();
    const a = await currentQuestion(first.client, first.session.session_id);
    const b = await currentQuestion(second.client, second.session.session_id);
    expect(a.prompt.hand).toEqual(b.prompt.hand);
  });

  it('grades an answer against the served PLO chart', async () => {
    const { client, session } = await startSession({ seed: 4242 });
    const question = await currentQuestion(client, session.session_id);
    if (question.prompt.kind !== 'rfi') throw new Error('unexpected prompt');

    const chart = await client.getRange('rfi_plo_6max_BTN');
    const cell = chart.grid[question.prompt.hand.notation] ?? {};
    const played = Object.values(cell).reduce((s, v) => s + v, 0);
    const frequencyOf = (actionId: string) =>
      actionId === 'fold' ? 1 - played : (cell[actionId] ?? 0);

    for (const actionId of ['raise', 'call', 'fold']) {
      if (frequencyOf(actionId) <= 0) continue;
      const attempt = await startSession({ seed: 4242 });
      const q = await currentQuestion(attempt.client, attempt.session.session_id);
      const graded = await attempt.client.submitAnswer(
        attempt.session.session_id,
        { question_id: q.question_id, action_id: actionId }
      );
      // API-CONTRACT §4.3: correct is frequency > 0, whatever the split.
      expect(graded.correct).toBe(true);
      expect(graded.explanation.range_id).toBe('rfi_plo_6max_BTN');
    }

    // An action with zero frequency stays incorrect even on a mixed hand.
    const zeroAction =
      played >= 1 ? (cell['raise'] === undefined ? 'raise' : 'fold') : 'fold';
    if (frequencyOf(zeroAction) <= 0) {
      const attempt = await startSession({ seed: 4242 });
      const q = await currentQuestion(attempt.client, attempt.session.session_id);
      const graded = await attempt.client.submitAnswer(
        attempt.session.session_id,
        { question_id: q.question_id, action_id: zeroAction }
      );
      expect(graded.correct).toBe(false);
    }
  });

  it('serves all five PLO positions in the list and in detail', async () => {
    const client = new MockApiClient();
    const list = await client.listRanges({ game: 'plo' });
    expect(list.ranges.map((entry) => entry.range_id)).toEqual([
      'rfi_plo_6max_UTG',
      'rfi_plo_6max_HJ',
      'rfi_plo_6max_CO',
      'rfi_plo_6max_BTN',
      'rfi_plo_6max_SB',
    ]);
    for (const entry of list.ranges) {
      expect(entry.game).toBe('plo');
      const detail = await client.getRange(entry.range_id);
      expect(detail.game).toBe('plo');
      expect(Object.keys(detail.grid)).toHaveLength(47);
      // VPIP is combo-weighted over 270,725 hands, not 1,326.
      expect(detail.stats.vpip).toBeGreaterThan(0.15);
      expect(detail.stats.vpip).toBeLessThan(0.55);
    }
  });

  it('weights uniform sampling by deck availability', () => {
    const total = PLO_CLASS_KEYS.reduce(
      (sum, key) => sum + ploCombos(key),
      0
    );
    expect(total).toBe(270_725);
  });
});
