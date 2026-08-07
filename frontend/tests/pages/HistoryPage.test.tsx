import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  HISTORY_STORAGE_KEY,
  HISTORY_VERSION,
  type StoredSession,
} from '@/lib/history';
import { HistoryPage } from '@/pages/HistoryPage';

function entry(
  completedAt: string,
  breakdown: [string, string, number, number][]
): StoredSession {
  return {
    version: HISTORY_VERSION,
    drill_id: 'rfi',
    config: { table_format: '6max' },
    completed_at: completedAt,
    answered: breakdown.reduce((sum, [, , a]) => sum + a, 0),
    correct: breakdown.reduce((sum, [, , , c]) => sum + c, 0),
    breakdown: breakdown.map(([key, label, answered, correct]) => ({
      key,
      label,
      answered,
      correct,
    })),
  };
}

function seed(sessions: StoredSession[]) {
  localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(sessions));
}

function renderPage() {
  render(
    <MemoryRouter
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <HistoryPage />
    </MemoryRouter>
  );
}

beforeEach(() => {
  localStorage.clear();
});

describe('history with nothing recorded', () => {
  it('explains itself instead of showing an empty chart', () => {
    renderPage();
    expect(screen.getByText(/Nothing here yet/)).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('says the data stays in this browser', () => {
    renderPage();
    expect(screen.getByText(/never sent anywhere/)).toBeInTheDocument();
  });
});

describe('history with sessions recorded', () => {
  beforeEach(() => {
    seed([
      entry('2026-08-07T10:00:00Z', [
        ['CO', 'Cutoff', 10, 9],
        ['SB', 'Small blind', 10, 2],
      ]),
      entry('2026-08-06T10:00:00Z', [
        ['CO', 'Cutoff', 10, 7],
        ['SB', 'Small blind', 10, 4],
      ]),
    ]);
  });

  it('shows the overall accuracy across every session', () => {
    renderPage();
    // 22 of 40.
    expect(screen.getByLabelText('Overall accuracy 55%')).toBeInTheDocument();
    expect(screen.getByText(/22 of 40 correct/)).toBeInTheDocument();
    expect(screen.getByText(/2 sessions/)).toBeInTheDocument();
  });

  it('names the weakest group using its own label, and says how it decided', () => {
    renderPage();
    const weakest = screen.getByText(/Weakest group/);
    expect(weakest).toHaveTextContent('Small blind');
    expect(weakest).toHaveTextContent('30%');
    expect(weakest).toHaveTextContent('20 hands');
    // The threshold is stated, so a worse-but-thinner row in the chart below
    // does not read as a contradiction.
    expect(weakest).toHaveTextContent('at least 5 hands');
  });

  it('still charts groups that are too thin to draw a verdict from', () => {
    seed([
      entry('2026-08-07T10:00:00Z', [
        ['CO', 'Cutoff', 10, 8],
        ['HJ', 'Hijack', 2, 0],
      ]),
    ]);
    renderPage();

    const table = screen.getByRole('table', { name: /Accuracy by group/ });
    expect(
      within(table).getByRole('rowheader', { name: 'Hijack' })
    ).toBeTruthy();
    // …but Hijack is not the headline verdict, because two hands prove nothing.
    expect(screen.getByText(/Weakest group/)).toHaveTextContent('Cutoff');
  });

  it('charts accuracy per group, worst first', () => {
    renderPage();
    const table = screen.getByRole('table', {
      name: /Accuracy by group/,
    });
    const rows = within(table).getAllByRole('rowheader');
    expect(rows.map((row) => row.textContent)).toEqual([
      'Small blind',
      'Cutoff',
    ]);
  });

  it('renders the trend oldest first, with an accessible description', () => {
    renderPage();
    const trend = screen.getByRole('img', { name: /Accuracy across the last/ });
    expect(trend).toHaveAccessibleName(/oldest first/);
    const bars = trend.querySelectorAll('[data-accuracy]');
    expect(bars).toHaveLength(2);
  });

  it('lists each session with its own accuracy', () => {
    renderPage();
    const list = screen.getByRole('heading', {
      name: 'Sessions',
    }).nextElementSibling!;
    expect(within(list as HTMLElement).getAllByRole('listitem')).toHaveLength(
      2
    );
  });

  it('clears on request', async () => {
    renderPage();
    await userEvent.click(
      screen.getByRole('button', { name: 'Clear history' })
    );
    expect(screen.getByText(/Nothing here yet/)).toBeInTheDocument();
    expect(localStorage.getItem(HISTORY_STORAGE_KEY)).toBeNull();
  });
});

describe('history with a thin sample', () => {
  it('declines to name a weakest group before the sample supports it', () => {
    seed([entry('2026-08-07T10:00:00Z', [['SB', 'Small blind', 2, 0]])]);
    renderPage();

    expect(screen.queryByText(/Weakest group/)).not.toBeInTheDocument();
    expect(screen.getByText(/keep drilling/)).toBeInTheDocument();
  });
});

describe('history with a corrupt payload', () => {
  it('renders the empty state rather than crashing', () => {
    localStorage.setItem(HISTORY_STORAGE_KEY, '{{{ not json');
    expect(() => renderPage()).not.toThrow();
    expect(screen.getByText(/Nothing here yet/)).toBeInTheDocument();
  });

  it('ignores entries written by another version', () => {
    localStorage.setItem(
      HISTORY_STORAGE_KEY,
      JSON.stringify([
        {
          ...entry('2026-08-07T10:00:00Z', [['CO', 'Cutoff', 5, 5]]),
          version: 99,
        },
      ])
    );
    renderPage();
    expect(screen.getByText(/Nothing here yet/)).toBeInTheDocument();
  });
});
