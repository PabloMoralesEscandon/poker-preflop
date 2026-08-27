import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';

import { MockApiClient } from '@/api/mock';
import { DrillRunner } from '@/drills/DrillRunner';
import { HISTORY_STORAGE_KEY, parseHistory } from '@/lib/history';
import '@/drills/register';

/**
 * The third drill, and the sharper test of ARCHITECTURE §4.3 — because this one
 * breaks an assumption the first two shared.
 *
 * `vs_rfi` proved the runner could absorb a drill with different actions.
 * `bvb` asks whether it can absorb one where **fold is not an action at all**.
 * Nothing under `src/drills/DrillRunner.tsx`, `ConfigForm`, `FeedbackPanel`,
 * `SummaryView`, `shortcuts` or `history` was touched for it; if any test here
 * needed such a change to pass, that is the finding, not the fix.
 */

function renderRunner(client = new MockApiClient()) {
  render(
    <MemoryRouter
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <DrillRunner drillId="bvb" client={client} />
    </MemoryRouter>
  );
}

/** Leaves exactly the named branch ticked, so a session is deterministic. */
async function selectOnly(branch: string) {
  for (const box of screen.getAllByRole('checkbox')) {
    const wanted = box.closest('label')?.textContent?.trim() === branch;
    if ((box as HTMLInputElement).checked !== wanted) {
      await userEvent.click(box);
    }
  }
}

async function startSession(hands = 5, branch?: string) {
  renderRunner();
  await screen.findByRole('button', { name: 'Start session' });
  if (branch) await selectOnly(branch);

  const count = screen.getByRole('spinbutton', { name: /Hands/ });
  await userEvent.clear(count);
  await userEvent.type(count, String(hands));
  await userEvent.click(screen.getByRole('button', { name: 'Start session' }));

  await screen.findByRole('group', { name: 'Your action' });
}

const actionGroup = () =>
  within(screen.getByRole('group', { name: 'Your action' }));

const actionIds = () =>
  actionGroup()
    .getAllByRole('button')
    .map((button) => button.getAttribute('data-action-id'));

beforeEach(() => {
  localStorage.clear();
});

describe('the generic config form renders the bvb schema', () => {
  it('loads the drill by id and shows its own name', async () => {
    renderRunner();
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent(
      'Blind vs Blind'
    );
  });

  it('renders the branch multi_enum with no change to the form', async () => {
    renderRunner();
    await screen.findByRole('button', { name: 'Start session' });

    expect(screen.getByRole('checkbox', { name: 'Facing a limp' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Facing a raise' })).toBeChecked();
    // No trace of the other drills' vocabulary.
    expect(
      screen.queryByRole('checkbox', { name: 'Cutoff' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('checkbox', { name: 'BB vs BTN' })
    ).not.toBeInTheDocument();
  });

  it('still enforces the documented int bounds', async () => {
    renderRunner();
    const count = await screen.findByRole('spinbutton', { name: /Hands/ });
    expect(count).toHaveAttribute('min', '5');
    expect(count).toHaveAttribute('max', '200');
  });

  it('blocks starting with no branch selected', async () => {
    renderRunner();
    await screen.findByRole('button', { name: 'Start session' });
    for (const box of screen.getAllByRole('checkbox')) {
      await userEvent.click(box);
    }

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Start session' })
    ).toBeDisabled();
  });
});

describe('a bvb session through the unmodified runner', () => {
  it('renders the bvb prompt, resolved by kind', async () => {
    await startSession(5, 'Facing a limp');
    expect(document.querySelector('[data-sb-action]')).toHaveAttribute(
      'data-sb-action',
      'limp'
    );
    expect(screen.getByLabelText('Table positions')).toBeInTheDocument();
  });

  it('drives config → question → feedback → summary', async () => {
    await startSession(5, 'Facing a limp');

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

  it('shows feedback against the vs_limp chart, with the hand highlighted', async () => {
    await startSession(5, 'Facing a limp');

    const hand = screen.getByText(/^[AKQJT2-9]{2}[so]?$/).textContent?.trim();
    await userEvent.click(actionGroup().getAllByRole('button')[0]!);

    await screen.findByRole('button', { name: 'Next hand' });
    await waitFor(() => expect(screen.getByRole('grid')).toBeInTheDocument());

    expect(screen.getByRole('grid').getAttribute('aria-label')).toBe(
      'vs_limp_6max_BB_vs_SB'
    );

    const highlighted = screen
      .getAllByRole('gridcell')
      .filter((cell) => cell.dataset['highlighted'] === 'true');
    expect(highlighted).toHaveLength(1);
    expect(highlighted[0]?.dataset['hand']).toBe(hand);
  });

  it('groups the summary by branch, through the same generic view', async () => {
    await startSession(5, 'Facing a limp');
    for (let i = 0; i < 5; i += 1) {
      await userEvent.click(actionGroup().getAllByRole('button')[0]!);
      await userEvent.click(
        await screen.findByRole('button', { name: 'Next hand' })
      );
    }
    await screen.findByRole('heading', { name: 'Session complete' });

    const table = screen.getByRole('table', { name: /Breakdown/ });
    const rows = within(table)
      .getAllByRole('rowheader')
      .map((row) => row.textContent);
    expect(rows).toEqual(['BB vs SB limp']);
  });

  it('records the session in the same history store', async () => {
    await startSession(5, 'Facing a limp');
    for (let i = 0; i < 5; i += 1) {
      await userEvent.click(actionGroup().getAllByRole('button')[0]!);
      await userEvent.click(
        await screen.findByRole('button', { name: 'Next hand' })
      );
    }
    await screen.findByRole('heading', { name: 'Session complete' });

    const history = parseHistory(localStorage.getItem(HISTORY_STORAGE_KEY));
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ drill_id: 'bvb', answered: 5 });
    expect(history[0]?.breakdown[0]?.key).toBe('BB vs SB limp');
  });
});

/**
 * The property FE-13 exists to protect, asserted at the level where it could
 * actually regress: the server decides the action set, the runner derives the
 * keyboard from it, and neither invents a fold.
 */
describe('no fold anywhere on the limp branch', () => {
  it('offers exactly check and raise, in that order', async () => {
    await startSession(5, 'Facing a limp');
    expect(actionIds()).toEqual(['check', 'raise']);
  });

  it('binds no fold key, so pressing f does nothing', async () => {
    await startSession(5, 'Facing a limp');

    expect(document.querySelectorAll('[data-shortcut="f"]')).toHaveLength(0);

    await userEvent.keyboard('f');
    // Still on the question: no answer was submitted, so no feedback appeared.
    expect(
      screen.queryByRole('button', { name: 'Next hand' })
    ).not.toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute(
      'aria-valuenow',
      '0'
    );
  });

  it('is playable with the derived bindings instead', async () => {
    await startSession(5, 'Facing a limp');

    for (let hand = 0; hand < 5; hand += 1) {
      await userEvent.keyboard('c');
      await screen.findByRole('button', { name: 'Next hand' });
      await userEvent.keyboard('{Enter}');
    }

    expect(
      await screen.findByRole('heading', { name: 'Session complete' })
    ).toBeInTheDocument();
  });

  it('never grades check as wrong where the chart checks', async () => {
    // A limp-branch cell is pure: 127 of 169 hands check at frequency 1.0 and
    // the other 42 raise. Whichever is dealt, one of the two buttons is right
    // and neither is a fold.
    const client = new MockApiClient();
    const session = await client.createSession({
      drill_id: 'bvb',
      config: { situations: ['limp'], question_count: 5 },
      seed: 7,
    });

    for (let i = 0; i < 5; i += 1) {
      const next = await client.getNextQuestion(session.session_id);
      if (next.done) break;
      expect(next.question.actions.map((a) => a.id)).toEqual([
        'check',
        'raise',
      ]);

      const answer = await client.submitAnswer(session.session_id, {
        question_id: next.question.question_id,
        action_id: next.question.actions[0]!.id,
      });
      // Fold is never the expected action here, and never mixed in.
      expect(answer.expected.action_id).not.toBe('fold');
      expect(answer.mixed).toBeUndefined();
      expect(answer.explanation.range_id).toBe('vs_limp_6max_BB_vs_SB');
    }
  });
});

describe('the raise branch is an ordinary facing-a-raise spot', () => {
  it('brings fold back, and grades against a vs_rfi chart', async () => {
    const client = new MockApiClient();
    const session = await client.createSession({
      drill_id: 'bvb',
      config: { situations: ['raise'], question_count: 5 },
      seed: 11,
    });

    const next = await client.getNextQuestion(session.session_id);
    if (next.done) throw new Error('expected a question');
    expect(next.question.actions.map((action) => action.id)).toEqual([
      'fold',
      'call',
      '3bet',
    ]);

    const answer = await client.submitAnswer(session.session_id, {
      question_id: next.question.question_id,
      action_id: 'fold',
    });
    expect(answer.explanation.range_id).toBe('vs_rfi_6max_BB_vs_SB');
  });

  it('offers a fold key on the branch that has a fold', async () => {
    await startSession(5, 'Facing a raise');
    expect(actionIds()).toContain('fold');
    expect(document.querySelectorAll('[data-shortcut="f"]')).toHaveLength(1);
  });
});
