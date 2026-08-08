import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ApiError, type ApiClient } from '@/api';
import { HISTORY_STORAGE_KEY, parseHistory } from '@/lib/history';
import { MockApiClient } from '@/api/mock';
import { DrillRunner } from '@/drills/DrillRunner';
import { drillRegistry, registerDrill } from '@/drills/registry';

/**
 * A stand-in drill UI. The runner is supposed to work with any prompt kind, so
 * driving it with a component it has never heard of is the point: if this test
 * needs the real RFI UI, the runner is not generic.
 */
function StubPrompt({
  prompt,
  actions,
  onAction,
  disabled,
  shortcuts = [],
}: {
  prompt: { kind: string };
  actions: { id: string; label: string }[];
  onAction: (actionId: string) => void;
  disabled?: boolean;
  shortcuts?: readonly { actionId: string; key: string }[];
}) {
  return (
    <div>
      <p data-testid="stub-kind">{prompt.kind}</p>
      {actions.map((action) => (
        <button
          key={action.id}
          type="button"
          disabled={disabled}
          data-shortcut={
            shortcuts.find((s) => s.actionId === action.id)?.key ?? ''
          }
          onClick={() => onAction(action.id)}
        >
          {action.label}
        </button>
      ))}
    </div>
  );
}

beforeEach(() => {
  localStorage.clear();
  registerDrill('rfi', {
    Prompt: StubPrompt as never,
    gridHighlight: (prompt) => ('hand' in prompt ? prompt.hand.notation : null),
  });
});

afterEach(() => {
  for (const key of Object.keys(drillRegistry)) delete drillRegistry[key];
});

/**
 * An {@link ApiClient} that delegates to `base` except for the methods given.
 * Spreading a class instance would drop its prototype methods, so bind them.
 */
function clientWith(base: ApiClient, overrides: Partial<ApiClient>): ApiClient {
  return {
    getHealth: base.getHealth.bind(base),
    getSources: base.getSources.bind(base),
    listDrills: base.listDrills.bind(base),
    createSession: base.createSession.bind(base),
    getNextQuestion: base.getNextQuestion.bind(base),
    submitAnswer: base.submitAnswer.bind(base),
    getSummary: base.getSummary.bind(base),
    listRanges: base.listRanges.bind(base),
    getRange: base.getRange.bind(base),
    ...overrides,
  };
}

// 5 is the schema minimum for question_count.
/** The runner lives inside the router in the real app; the summary links out. */
function renderRunner(drillId: string, client: ApiClient) {
  return render(
    <MemoryRouter
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <DrillRunner drillId={drillId} client={client} />
    </MemoryRouter>
  );
}

async function startSession(client: ApiClient, hands = 5) {
  renderRunner('rfi', client);

  await screen.findByRole('button', { name: 'Start session' });

  const count = screen.getByRole('spinbutton', { name: /Hands/ });
  await userEvent.clear(count);
  await userEvent.type(count, String(hands));
  await userEvent.click(screen.getByRole('button', { name: 'Start session' }));

  await screen.findByTestId('stub-kind');
}

describe('DrillRunner session loop', () => {
  it('loads the drill and shows its config form first', async () => {
    renderRunner('rfi', new MockApiClient());

    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent(
      'Raise First In'
    );
    expect(
      screen.getByRole('button', { name: 'Start session' })
    ).toBeInTheDocument();
    // No question until a session is created.
    expect(screen.queryByTestId('stub-kind')).not.toBeInTheDocument();
  });

  it('drives a whole session config → question → feedback → summary', async () => {
    const client = new MockApiClient();
    await startSession(client, 5);

    for (let hand = 1; hand <= 5; hand += 1) {
      expect(screen.getByRole('progressbar')).toHaveAttribute(
        'aria-valuenow',
        String(hand - 1)
      );

      await userEvent.click(
        screen.getAllByRole('button', { name: /^Fold$/ })[0]!
      );

      const next = await screen.findByRole('button', { name: 'Next hand' });
      expect(screen.getByRole('progressbar')).toHaveAttribute(
        'aria-valuenow',
        String(hand)
      );
      await userEvent.click(next);
    }

    expect(
      await screen.findByRole('heading', { name: 'Session complete' })
    ).toBeInTheDocument();
    expect(screen.getByText(/of 5 correct/)).toBeInTheDocument();
  });

  it('shows a breakdown and offers a new session at the end', async () => {
    const client = new MockApiClient();
    await startSession(client, 5);

    for (let i = 0; i < 5; i += 1) {
      await userEvent.click(
        screen.getAllByRole('button', { name: /^Fold$/ })[0]!
      );
      await userEvent.click(
        await screen.findByRole('button', { name: 'Next hand' })
      );
    }

    await screen.findByRole('heading', { name: 'Session complete' });
    expect(screen.getByRole('table')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'New session' }));
    expect(
      await screen.findByRole('button', { name: 'Start session' })
    ).toBeInTheDocument();
  });

  it('sends the answer for the question actually on screen', async () => {
    const client = new MockApiClient();
    await startSession(client, 5);

    await userEvent.click(
      screen.getAllByRole('button', { name: /^Raise/ })[0]!
    );
    await screen.findByRole('button', { name: 'Next hand' });

    // The mock 409s an out-of-order answer, so reaching feedback at all proves
    // the runner submitted the current question_id.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('advances the question only after an answer', async () => {
    const client = new MockApiClient();
    await startSession(client, 5);

    const progress = screen.getByRole('progressbar');
    expect(progress).toHaveAttribute('aria-valuenow', '0');
    expect(progress).toHaveAttribute('aria-valuemax', '5');
  });
});

describe('DrillRunner registry boundary', () => {
  it('renders an error rather than guessing when a kind is unregistered', async () => {
    for (const key of Object.keys(drillRegistry)) delete drillRegistry[key];

    const client = new MockApiClient();
    renderRunner('rfi', client);
    await screen.findByRole('button', { name: 'Start session' });
    await userEvent.click(
      screen.getByRole('button', { name: 'Start session' })
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /No UI is registered for prompt kind "rfi"/
    );
  });
});

describe('DrillRunner error states', () => {
  it('reports a failure to load the drill list, and retries', async () => {
    let attempts = 0;
    const base = new MockApiClient();
    const client = clientWith(base, {
      listDrills: async () => {
        attempts += 1;
        if (attempts === 1) {
          throw new ApiError('internal_error', 'Unexpected server error.', 500);
        }
        return base.listDrills();
      },
    });

    renderRunner('rfi', client);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('The server had a problem');

    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(
      await screen.findByRole('button', { name: 'Start session' })
    ).toBeInTheDocument();
  });

  it('explains an unknown drill id', async () => {
    renderRunner('omaha', new MockApiClient());
    expect(await screen.findByRole('alert')).toHaveTextContent(
      /Unknown drill id omaha/
    );
  });

  it('surfaces a typed API error by code, not by message', async () => {
    const base = new MockApiClient();
    const client = clientWith(base, {
      createSession: async () => {
        throw new ApiError('session_not_found', 'Unknown session id.', 404);
      },
    });

    renderRunner('rfi', client);
    await screen.findByRole('button', { name: 'Start session' });
    await userEvent.click(
      screen.getByRole('button', { name: 'Start session' })
    );

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'This session has expired'
      )
    );
  });
});

/**
 * A finished session is recorded locally, once. FE-06 stores per-key counts and
 * deliberately not the question log.
 */
describe('DrillRunner records a finished session', () => {
  it('writes one history entry when the session completes', async () => {
    const client = new MockApiClient();
    await startSession(client, 5);

    expect(parseHistory(localStorage.getItem(HISTORY_STORAGE_KEY))).toEqual([]);

    for (let i = 0; i < 5; i += 1) {
      await userEvent.click(
        screen.getAllByRole('button', { name: /^Fold$/ })[0]!
      );
      await userEvent.click(
        await screen.findByRole('button', { name: 'Next hand' })
      );
    }
    await screen.findByRole('heading', { name: 'Session complete' });

    const history = parseHistory(localStorage.getItem(HISTORY_STORAGE_KEY));
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ drill_id: 'rfi', answered: 5 });
    expect(history[0]?.config).toMatchObject({ question_count: 5 });
    expect(history[0]?.breakdown.length).toBeGreaterThan(0);
  });

  it('records nothing until the session is actually over', async () => {
    const client = new MockApiClient();
    await startSession(client, 5);

    await userEvent.click(
      screen.getAllByRole('button', { name: /^Fold$/ })[0]!
    );
    await screen.findByRole('button', { name: 'Next hand' });

    expect(parseHistory(localStorage.getItem(HISTORY_STORAGE_KEY))).toEqual([]);
  });

  it('stores counts, never the hands that were played', async () => {
    const client = new MockApiClient();
    await startSession(client, 5);
    for (let i = 0; i < 5; i += 1) {
      await userEvent.click(
        screen.getAllByRole('button', { name: /^Fold$/ })[0]!
      );
      await userEvent.click(
        await screen.findByRole('button', { name: 'Next hand' })
      );
    }
    await screen.findByRole('heading', { name: 'Session complete' });

    const raw = localStorage.getItem(HISTORY_STORAGE_KEY) ?? '';
    expect(raw).not.toContain('question_id');
    expect(raw).not.toContain('notation');
    expect(raw).not.toContain('cards');
  });
});

/**
 * FE-07's definition of done: a full session completable with the keyboard
 * alone. These drive it with `userEvent.keyboard` and never call `click`.
 */
describe('DrillRunner keyboard control', () => {
  it('answers with the key derived from the action id', async () => {
    const client = new MockApiClient();
    await startSession(client, 5);

    // f for fold, derived from the action id rather than hardcoded.
    await userEvent.keyboard('f');
    expect(
      await screen.findByRole('button', { name: 'Next hand' })
    ).toBeInTheDocument();
  });

  it('completes an entire session without a single click', async () => {
    const client = new MockApiClient();
    await startSession(client, 5);

    for (let hand = 0; hand < 5; hand += 1) {
      await userEvent.keyboard('f');
      await screen.findByRole('button', { name: 'Next hand' });
      await userEvent.keyboard('{Enter}');
    }

    expect(
      await screen.findByRole('heading', { name: 'Session complete' })
    ).toBeInTheDocument();
  });

  it('accepts Space as well as Enter to move on', async () => {
    const client = new MockApiClient();
    await startSession(client, 5);

    await userEvent.keyboard('r');
    await screen.findByRole('button', { name: 'Next hand' });
    await userEvent.keyboard('[Space]');

    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'Next hand' })
      ).not.toBeInTheDocument()
    );
  });

  it('ignores an action key while feedback is up', async () => {
    const client = new MockApiClient();
    await startSession(client, 5);

    await userEvent.keyboard('f');
    await screen.findByRole('button', { name: 'Next hand' });

    // "f" is not bound during feedback; the panel must stay put.
    await userEvent.keyboard('f');
    expect(
      screen.getByRole('button', { name: 'Next hand' })
    ).toBeInTheDocument();
  });

  it('ignores shortcuts combined with a modifier', async () => {
    const client = new MockApiClient();
    await startSession(client, 5);

    await userEvent.keyboard('{Control>}f{/Control}');
    expect(
      screen.queryByRole('button', { name: 'Next hand' })
    ).not.toBeInTheDocument();
  });

  it('does not hijack typing in the config form', async () => {
    const client = new MockApiClient();
    render(
      <MemoryRouter
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <DrillRunner drillId="rfi" client={client} />
      </MemoryRouter>
    );
    const count = await screen.findByRole('spinbutton', { name: /Hands/ });
    await userEvent.clear(count);
    await userEvent.type(count, '15');
    expect(count).toHaveValue(15);
  });

  it('hands the derived bindings to whatever drill is registered', async () => {
    const client = new MockApiClient();
    await startSession(client, 5);

    expect(screen.getByRole('button', { name: 'Fold' })).toHaveAttribute(
      'data-shortcut',
      'f'
    );
    expect(screen.getByRole('button', { name: /^Raise/ })).toHaveAttribute(
      'data-shortcut',
      'r'
    );
  });

  it('moves focus to the question when it changes', async () => {
    const client = new MockApiClient();
    await startSession(client, 5);

    await waitFor(() =>
      expect(document.activeElement).toHaveAttribute(
        'aria-label',
        'Hand 1 of 5'
      )
    );

    await userEvent.keyboard('f');
    await screen.findByRole('button', { name: 'Next hand' });
    await userEvent.keyboard('{Enter}');

    await waitFor(() =>
      expect(document.activeElement).toHaveAttribute(
        'aria-label',
        'Hand 2 of 5'
      )
    );
  });

  it('announces the verdict in a single live region', async () => {
    const client = new MockApiClient();
    await startSession(client, 5);
    await userEvent.keyboard('f');
    await screen.findByRole('button', { name: 'Next hand' });

    const live = screen.getByRole('status');
    expect(live).toHaveAttribute('aria-live', 'polite');
    expect(live.textContent).toMatch(
      /^(Correct|Not the chart action|Acceptable, a mixed spot)\./
    );
    // The chart is not inside a live region; only this sentence is.
    expect(screen.getAllByRole('status')).toHaveLength(1);
  });
});
