import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  aggregate,
  HISTORY_STORAGE_KEY,
  HISTORY_VERSION,
  type StoredSession,
} from '@/lib/history';
import { HistoryPage } from '@/pages/HistoryPage';

/**
 * FE-12 asks this to be verified rather than assumed: both the summary and the
 * history key off `breakdown[].key`, so a `vs_rfi` session whose keys are
 * matchups should aggregate with no changes. These sessions mix the two drills
 * to prove the keys do not collide or merge.
 */

function session(
  drillId: string,
  completedAt: string,
  breakdown: [string, number, number][]
): StoredSession {
  return {
    version: HISTORY_VERSION,
    drill_id: drillId,
    config: { table_format: '6max' },
    completed_at: completedAt,
    answered: breakdown.reduce((sum, [, a]) => sum + a, 0),
    correct: breakdown.reduce((sum, [, , c]) => sum + c, 0),
    breakdown: breakdown.map(([key, answered, correct]) => ({
      key,
      label: key,
      answered,
      correct,
    })),
  };
}

const RFI = session('rfi', '2026-08-08T09:00:00Z', [
  ['CO', 10, 9],
  ['SB', 10, 3],
]);

const VS_RFI = session('vs_rfi', '2026-08-08T10:00:00Z', [
  ['BB vs BTN', 10, 8],
  ['SB vs UTG', 10, 2],
]);

function renderHistory() {
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

describe('aggregating both drills together', () => {
  it('keeps matchup keys and position keys apart', () => {
    const summary = aggregate([VS_RFI, RFI]);
    expect(summary.byKey.map((stat) => stat.key).sort()).toEqual([
      'BB vs BTN',
      'CO',
      'SB',
      'SB vs UTG',
    ]);
    // "SB" and "SB vs UTG" are different groups, not one merged bucket.
    expect(summary.byKey.find((s) => s.key === 'SB')?.answered).toBe(10);
    expect(summary.byKey.find((s) => s.key === 'SB vs UTG')?.answered).toBe(10);
  });

  it('picks the weakest group across drills, whichever drill it came from', () => {
    const summary = aggregate([VS_RFI, RFI]);
    expect(summary.weakest[0]?.key).toBe('SB vs UTG');
    expect(summary.weakest[0]?.accuracy).toBeCloseTo(0.2, 6);
  });

  it('totals every session regardless of drill', () => {
    const summary = aggregate([VS_RFI, RFI]);
    expect(summary.sessions).toBe(2);
    expect(summary.answered).toBe(40);
    expect(summary.correct).toBe(22);
  });
});

describe('the history screen with both drills recorded', () => {
  beforeEach(() => {
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify([VS_RFI, RFI]));
  });

  it('charts matchup groups alongside position groups', () => {
    renderHistory();
    const table = screen.getByRole('table', { name: /Accuracy by group/ });
    const rows = within(table)
      .getAllByRole('rowheader')
      .map((row) => row.textContent);

    expect(rows).toContain('BB vs BTN');
    expect(rows).toContain('SB vs UTG');
    expect(rows).toContain('CO');
    // Worst first, across both drills.
    expect(rows[0]).toBe('SB vs UTG');
  });

  it('names the weakest group even when it is a matchup', () => {
    renderHistory();
    expect(screen.getByText(/Weakest group/)).toHaveTextContent('SB vs UTG');
  });

  it('lists each session under its own drill id', () => {
    renderHistory();
    const list = screen.getByRole('heading', { name: 'Sessions' })
      .nextElementSibling as HTMLElement;
    const items = within(list)
      .getAllByRole('listitem')
      .map((item) => item.textContent);

    expect(items).toHaveLength(2);
    expect(items.some((text) => text?.includes('vs_rfi'))).toBe(true);
    expect(items.some((text) => /(^|[^_])rfi/.test(text ?? ''))).toBe(true);
  });

  it('plots one trend point per session', () => {
    renderHistory();
    const trend = screen.getByRole('img', { name: /Accuracy across the last/ });
    expect(trend.querySelectorAll('[data-accuracy]')).toHaveLength(2);
  });
});
