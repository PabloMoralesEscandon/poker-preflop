import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';

import { MockApiClient } from '@/api/mock';
import { DrillRunner } from '@/drills/DrillRunner';
import { HISTORY_STORAGE_KEY, parseHistory } from '@/lib/history';
import '@/drills/register';

/**
 * The real test of ARCHITECTURE §4.3: a second drill absorbed by registration
 * alone.
 *
 * Everything driving this session — the runner, the config form, the feedback
 * panel, the summary, the keyboard, the history — is the code written for `rfi`
 * with no edits. The only new things are `VsRfiPrompt` and one `registerDrill`
 * call. If any of these tests need a change to shared code to pass, the
 * abstraction failed and that is the finding.
 */

function renderRunner(client = new MockApiClient()) {
  render(
    <MemoryRouter
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <DrillRunner drillId="vs_rfi" client={client} />
    </MemoryRouter>
  );
}

async function startSession(hands = 5) {
  renderRunner();
  await screen.findByRole('button', { name: 'Start session' });

  const count = screen.getByRole('spinbutton', { name: /Hands/ });
  await userEvent.clear(count);
  await userEvent.type(count, String(hands));
  await userEvent.click(screen.getByRole('button', { name: 'Start session' }));

  await screen.findByRole('group', { name: 'Your action' });
}

beforeEach(() => {
  localStorage.clear();
});

describe('the generic config form renders the vs_rfi schema', () => {
  it('loads the drill by id and shows its own name', async () => {
    renderRunner();
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent(
      'Facing a Raise'
    );
  });

  it('renders the matchup multi_enum with no change to the form', async () => {
    renderRunner();
    await screen.findByRole('button', { name: 'Start session' });

    // A field the RFI drill does not have, rendered from config_schema alone.
    expect(
      screen.getByRole('checkbox', { name: 'BB vs BTN' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('checkbox', { name: 'HJ vs UTG' })
    ).toBeInTheDocument();
    // And no trace of the other drill's vocabulary.
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

  it('blocks starting with no matchup selected', async () => {
    renderRunner();
    await screen.findByRole('button', { name: 'Start session' });
    await userEvent.click(screen.getByRole('checkbox', { name: 'BB vs BTN' }));

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Start session' })
    ).toBeDisabled();
  });
});

describe('a vs_rfi session through the unmodified runner', () => {
  it('renders the vs_rfi prompt, resolved by kind', async () => {
    await startSession();
    expect(screen.getByText(/raised to/)).toBeInTheDocument();
    expect(screen.getByLabelText('Table positions')).toBeInTheDocument();
  });

  /**
   * `folded_before` means the seats that folded before the raiser, who was
   * first into the pot — the reading `next_question_vs_rfi.json` encodes when
   * it lists UTG, HJ and CO for BB vs BTN and omits the SB.
   */
  it('marks every seat before the raiser as folded', async () => {
    renderRunner();
    await screen.findByRole('button', { name: 'Start session' });
    // BB vs BTN only, so the seat layout is deterministic.
    await userEvent.click(
      screen.getByRole('button', { name: 'Start session' })
    );
    await screen.findByRole('group', { name: 'Your action' });

    const seatOf = (position: string) =>
      document
        .querySelector(`[data-position="${position}"]`)
        ?.getAttribute('data-seat');

    expect(seatOf('UTG')).toBe('folded');
    expect(seatOf('HJ')).toBe('folded');
    expect(seatOf('CO')).toBe('folded');
    expect(seatOf('BTN')).toBe('raiser');
    expect(seatOf('BB')).toBe('hero');
  });

  it('drives config → question → feedback → summary', async () => {
    await startSession(5);

    for (let hand = 1; hand <= 5; hand += 1) {
      expect(screen.getByRole('progressbar')).toHaveAttribute(
        'aria-valuenow',
        String(hand - 1)
      );
      await userEvent.click(
        screen.getAllByRole('button', { name: /^Fold/ })[0]!
      );
      await userEvent.click(
        await screen.findByRole('button', { name: 'Next hand' })
      );
    }

    expect(
      await screen.findByRole('heading', { name: 'Session complete' })
    ).toBeInTheDocument();
  });

  it('shows feedback with the matchup chart and the played hand highlighted', async () => {
    await startSession();

    const hand = screen.getByText(/^[AKQJT2-9]{2}[so]?$/).textContent?.trim();
    await userEvent.click(screen.getAllByRole('button', { name: /^Fold/ })[0]!);

    await screen.findByRole('button', { name: 'Next hand' });
    await waitFor(() => expect(screen.getByRole('grid')).toBeInTheDocument());

    const grid = screen.getByRole('grid');
    expect(grid.getAttribute('aria-label')).toMatch(/^vs_rfi_6max_/);

    const highlighted = screen
      .getAllByRole('gridcell')
      .filter((cell) => cell.dataset['highlighted'] === 'true');
    expect(highlighted).toHaveLength(1);
    expect(highlighted[0]?.dataset['hand']).toBe(hand);
  });

  it('is playable with the keyboard, using the derived bindings', async () => {
    await startSession(5);

    for (let hand = 0; hand < 5; hand += 1) {
      await userEvent.keyboard('f');
      await screen.findByRole('button', { name: 'Next hand' });
      await userEvent.keyboard('{Enter}');
    }

    expect(
      await screen.findByRole('heading', { name: 'Session complete' })
    ).toBeInTheDocument();
  });

  it('groups the summary by matchup, through the same generic view', async () => {
    await startSession(5);
    for (let i = 0; i < 5; i += 1) {
      await userEvent.click(
        screen.getAllByRole('button', { name: /^Fold/ })[0]!
      );
      await userEvent.click(
        await screen.findByRole('button', { name: 'Next hand' })
      );
    }
    await screen.findByRole('heading', { name: 'Session complete' });

    const table = screen.getByRole('table', { name: /Breakdown/ });
    const rows = within(table).getAllByRole('rowheader');
    expect(rows.length).toBeGreaterThan(0);
    // The breakdown key is the matchup, not a bare position.
    expect(rows.some((row) => /vs/.test(row.textContent ?? ''))).toBe(true);
  });

  it('records the session in the same history store', async () => {
    await startSession(5);
    for (let i = 0; i < 5; i += 1) {
      await userEvent.click(
        screen.getAllByRole('button', { name: /^Fold/ })[0]!
      );
      await userEvent.click(
        await screen.findByRole('button', { name: 'Next hand' })
      );
    }
    await screen.findByRole('heading', { name: 'Session complete' });

    const history = parseHistory(localStorage.getItem(HISTORY_STORAGE_KEY));
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ drill_id: 'vs_rfi', answered: 5 });
    expect(history[0]?.breakdown.length).toBeGreaterThan(0);
  });
});

describe('a matchup with no calling range', () => {
  it('offers two buttons, never assuming three', async () => {
    renderRunner();
    await screen.findByRole('button', { name: 'Start session' });

    // Drill only the 3-bet-or-fold matchup.
    await userEvent.click(screen.getByRole('checkbox', { name: 'BB vs BTN' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'HJ vs UTG' }));
    await userEvent.click(
      screen.getByRole('button', { name: 'Start session' })
    );

    const actions = within(
      await screen.findByRole('group', { name: 'Your action' })
    ).getAllByRole('button');

    expect(actions).toHaveLength(2);
    expect(
      actions.map((button) => button.getAttribute('data-action-id'))
    ).toEqual(['fold', '3bet']);
  });
});
