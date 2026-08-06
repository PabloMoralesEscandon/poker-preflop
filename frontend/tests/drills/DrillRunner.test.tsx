import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ApiError, type ApiClient } from '@/api';
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
}: {
  prompt: { kind: string };
  actions: { id: string; label: string }[];
  onAction: (actionId: string) => void;
  disabled?: boolean;
}) {
  return (
    <div>
      <p data-testid="stub-kind">{prompt.kind}</p>
      {actions.map((action) => (
        <button
          key={action.id}
          type="button"
          disabled={disabled}
          onClick={() => onAction(action.id)}
        >
          {action.label}
        </button>
      ))}
    </div>
  );
}

beforeEach(() => {
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
async function startSession(client: ApiClient, hands = 5) {
  render(<DrillRunner drillId="rfi" client={client} />);

  await screen.findByRole('button', { name: 'Start session' });

  const count = screen.getByRole('spinbutton', { name: /Hands/ });
  await userEvent.clear(count);
  await userEvent.type(count, String(hands));
  await userEvent.click(screen.getByRole('button', { name: 'Start session' }));

  await screen.findByTestId('stub-kind');
}

describe('DrillRunner session loop', () => {
  it('loads the drill and shows its config form first', async () => {
    render(<DrillRunner drillId="rfi" client={new MockApiClient()} />);

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
    render(<DrillRunner drillId="rfi" client={client} />);
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

    render(<DrillRunner drillId="rfi" client={client} />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('The server had a problem');

    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(
      await screen.findByRole('button', { name: 'Start session' })
    ).toBeInTheDocument();
  });

  it('explains an unknown drill id', async () => {
    render(<DrillRunner drillId="omaha" client={new MockApiClient()} />);
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

    render(<DrillRunner drillId="rfi" client={client} />);
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
