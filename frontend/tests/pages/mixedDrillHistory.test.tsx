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
 * matchups should aggregate with no changes. These sessions mix the drills to
 * prove the keys do not collide or merge.
 *
 * FE-13 asks the same question of a third drill. `bvb` is the harder case, and
 * deliberately included below: its keys extend a matchup rather than replacing
 * it — `BB vs SB limp` sits next to `BB vs SB` — so a naive prefix match would
 * merge them. Nothing in `history.ts` was changed for it.
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

/**
 * The blind-versus-blind raise branch is an ordinary `vs_rfi` matchup, and its
 * key `BB vs SB` is a strict prefix of both `bvb` keys — the collision worth
 * testing for.
 */
const BB_VS_SB = session('vs_rfi', '2026-08-08T11:00:00Z', [
  ['BB vs SB', 10, 7],
]);

const BVB = session('bvb', '2026-08-08T12:00:00Z', [
  ['BB vs SB limp', 10, 9],
  ['BB vs SB raise', 10, 1],
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

/**
 * FE-13's actual question: does a third drill need any change to absorb? It
 * does not — `history.ts` is untouched — and these assert why, rather than that
 * it happens to work.
 */
describe('aggregating a third drill', () => {
  it('keeps every group of all three drills apart', () => {
    const summary = aggregate([BVB, BB_VS_SB, VS_RFI, RFI]);
    expect(summary.byKey.map((stat) => stat.key).sort()).toEqual([
      'BB vs BTN',
      'BB vs SB',
      'BB vs SB limp',
      'BB vs SB raise',
      'CO',
      'SB',
      'SB vs UTG',
    ]);
  });

  it('does not merge a bvb branch into the matchup it extends', () => {
    const summary = aggregate([BVB, BB_VS_SB]);
    const at = (key: string) => summary.byKey.find((stat) => stat.key === key);
    expect(at('BB vs SB')?.correct).toBe(7);
    expect(at('BB vs SB limp')?.correct).toBe(9);
    expect(at('BB vs SB raise')?.correct).toBe(1);
  });

  it('picks the weakest group even when it comes from the new drill', () => {
    const summary = aggregate([BVB, BB_VS_SB, VS_RFI, RFI]);
    // 10% at the bvb raise branch is worse than anything the other two drills
    // recorded, and the weakest-group ranking has no notion of which drill a
    // key came from.
    expect(summary.weakest[0]?.key).toBe('BB vs SB raise');
    expect(summary.weakest[1]?.key).toBe('SB vs UTG');
  });

  it('totals a three-drill history', () => {
    const summary = aggregate([BVB, BB_VS_SB, VS_RFI, RFI]);
    expect(summary.sessions).toBe(4);
    expect(summary.answered).toBe(70);
    expect(summary.correct).toBe(39);
  });

  it('shows the bvb session on the screen with no change to it', () => {
    localStorage.setItem(
      HISTORY_STORAGE_KEY,
      JSON.stringify([BVB, BB_VS_SB, VS_RFI, RFI])
    );
    renderHistory();

    const table = screen.getByRole('table', { name: /Accuracy by group/ });
    const rows = within(table)
      .getAllByRole('rowheader')
      .map((row) => row.textContent);
    expect(rows).toContain('BB vs SB limp');
    expect(rows).toContain('BB vs SB raise');

    const list = screen.getByRole('heading', { name: 'Sessions' })
      .nextElementSibling as HTMLElement;
    expect(
      within(list)
        .getAllByRole('listitem')
        .some((item) => item.textContent?.includes('bvb'))
    ).toBe(true);
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
