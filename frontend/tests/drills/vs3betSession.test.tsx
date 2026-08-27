import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';

import { MockApiClient } from '@/api/mock';
import { DrillRunner } from '@/drills/DrillRunner';
import { HISTORY_STORAGE_KEY, parseHistory } from '@/lib/history';
import '@/drills/register';

/**
 * ARCHITECTURE §4.3 again, at the fourth drill and the first 8-max one.
 *
 * Everything driving this session is the code written for `rfi`, unchanged:
 * the runner, the config form, the feedback panel, the summary, the keyboard
 * and the history store. The only new things are `Vs3BetPrompt` and one
 * `registerDrill` call. A test here that needs a change to shared code is the
 * finding, not the fix.
 *
 * The spot-specific claim worth asserting is the one `reach` exists for: this
 * drill only ever deals hands hero opened. `72o` is not a hard question after
 * a 3-bet — it is not a question, because hero folded it before the 3-bet
 * existed.
 */

function renderRunner(client = new MockApiClient()) {
  render(
    <MemoryRouter
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <DrillRunner drillId="vs_3bet" client={client} />
    </MemoryRouter>
  );
}

/** Leaves exactly the named matchup ticked, so a session is deterministic. */
async function selectOnly(matchup: string) {
  for (const box of screen.getAllByRole('checkbox')) {
    const wanted = box.closest('label')?.textContent?.trim() === matchup;
    if ((box as HTMLInputElement).checked !== wanted) {
      await userEvent.click(box);
    }
  }
}

async function startSession(hands = 5, matchup?: string) {
  renderRunner();
  await screen.findByRole('button', { name: 'Start session' });
  if (matchup) await selectOnly(matchup);

  const count = screen.getByRole('spinbutton', { name: /Hands/ });
  await userEvent.clear(count);
  await userEvent.type(count, String(hands));
  await userEvent.click(screen.getByRole('button', { name: 'Start session' }));

  await screen.findByRole('group', { name: 'Your action' });
}

const actionGroup = () =>
  within(screen.getByRole('group', { name: 'Your action' }));

beforeEach(() => {
  localStorage.clear();
});

describe('the generic config form renders the vs_3bet schema', () => {
  it('loads the drill by id and shows its own name', async () => {
    renderRunner();
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent(
      'Facing a 3-Bet'
    );
  });

  it('offers the 28 matchups, with no change to the form', async () => {
    renderRunner();
    await screen.findByRole('button', { name: 'Start session' });
    expect(screen.getAllByRole('checkbox')).toHaveLength(28);
    // The full-ring seats, which no other drill's config form has shown.
    expect(
      screen.getByRole('checkbox', { name: 'UTG+1 vs Lojack 3-bet' })
    ).toBeInTheDocument();
    // No trace of the other drills' vocabulary.
    expect(
      screen.queryByRole('checkbox', { name: 'Cutoff' })
    ).not.toBeInTheDocument();
  });

  it('still enforces the documented int bounds', async () => {
    renderRunner();
    const count = await screen.findByRole('spinbutton', { name: /Hands/ });
    expect(count).toHaveAttribute('min', '5');
    expect(count).toHaveAttribute('max', '200');
  });
});

describe('a vs_3bet session through the unmodified runner', () => {
  it('renders the vs_3bet prompt, resolved by kind', async () => {
    await startSession(5, 'UTG vs Button 3-bet');
    expect(screen.getByText(/You opened to/)).toBeInTheDocument();
    expect(screen.getByLabelText('Table positions')).toBeInTheDocument();
  });

  it('drives config → question → feedback → summary', async () => {
    await startSession(5, 'UTG vs Button 3-bet');

    for (let hand = 1; hand <= 5; hand += 1) {
      expect(screen.getByRole('progressbar')).toHaveAttribute(
        'aria-valuenow',
        String(hand - 1)
      );
      await userEvent.click(actionGroup().getAllByRole('button')[0]!);
      await userEvent.click(
        await screen.findByRole('button', { name: 'Next hand' })
      );
    }

    expect(
      await screen.findByRole('heading', { name: 'Session complete' })
    ).toBeInTheDocument();
  });

  it('records the session in the same history store', async () => {
    await startSession(5, 'UTG vs Button 3-bet');
    for (let i = 0; i < 5; i += 1) {
      await userEvent.click(actionGroup().getAllByRole('button')[0]!);
      await userEvent.click(
        await screen.findByRole('button', { name: 'Next hand' })
      );
    }
    await screen.findByRole('heading', { name: 'Session complete' });

    const history = parseHistory(localStorage.getItem(HISTORY_STORAGE_KEY));
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ drill_id: 'vs_3bet', answered: 5 });
  });
});

describe('the drill deals only hands hero opened', () => {
  it('never asks about a hand outside the chart reach', async () => {
    const client = new MockApiClient();
    const range = await client.getRange('vs_3bet_8max_UTG_vs_BTN');
    const reach = new Set(range.reach ?? []);
    expect(reach.size).toBeGreaterThan(0);
    expect(reach.has('72o')).toBe(false);

    const session = await client.createSession({
      drill_id: 'vs_3bet',
      config: { matchups: ['UTG_vs_BTN'], question_count: 40 },
      seed: 11,
    });

    for (let i = 0; i < 40; i += 1) {
      const next = await client.getNextQuestion(session.session_id);
      if (next.done) break;
      const prompt = next.question.prompt;
      expect(prompt.kind).toBe('vs_3bet');
      expect(reach.has(prompt.hand.notation)).toBe(true);
      await client.submitAnswer(session.session_id, {
        question_id: next.question.question_id,
        action_id: next.question.actions[0]!.id,
      });
    }
  });

  it('prices the call against hero own open, not against the 3-bet', async () => {
    const client = new MockApiClient();
    const session = await client.createSession({
      drill_id: 'vs_3bet',
      config: { matchups: ['UTG_vs_BTN'], question_count: 5 },
      seed: 3,
    });
    const next = await client.getNextQuestion(session.session_id);
    if (next.done) throw new Error('expected a question');
    const prompt = next.question.prompt;
    if (prompt.kind !== 'vs_3bet') throw new Error('expected a vs_3bet prompt');

    // 3bb open, 10bb 3-bet, both blinds dead: 14.5bb pot and 7bb to call.
    expect(prompt.open_size_bb).toBe(3);
    expect(prompt.facing_size_bb).toBe(10);
    expect(prompt.pot_bb).toBe(14.5);
    expect(prompt.to_call_bb).toBe(7);
  });

  it('grades against the chart it says it graded against', async () => {
    const client = new MockApiClient();
    const session = await client.createSession({
      drill_id: 'vs_3bet',
      config: { matchups: ['UTG_vs_BTN'], question_count: 5 },
      seed: 5,
    });
    const next = await client.getNextQuestion(session.session_id);
    if (next.done) throw new Error('expected a question');

    const answer = await client.submitAnswer(session.session_id, {
      question_id: next.question.question_id,
      action_id: 'call',
    });
    expect(answer.explanation.range_id).toBe('vs_3bet_8max_UTG_vs_BTN');

    const range = await client.getRange('vs_3bet_8max_UTG_vs_BTN');
    const cell = range.grid[next.question.prompt.hand.notation] ?? {};
    expect(answer.correct).toBe((cell['call'] ?? 0) > 0);
  });
});
