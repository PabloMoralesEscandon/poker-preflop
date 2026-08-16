import { render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { ChartsPage } from '@/pages/ChartsPage';
import { RangePage } from '@/pages/RangePage';

/**
 * The chart browser meeting a range where nothing folds.
 *
 * A `vs_limp` grid is coloured in all 169 cells (RANGE-DATA-FORMAT §9), which
 * is correct and looks exactly like a chart that failed to apply its fold
 * state. So the tests here are less about the grid than about everything around
 * it saying, unprompted, that 0% is the real number: the legend, the totals
 * table, and the sizes line where `check` costs nothing.
 */

const RANGE_ID = 'vs_limp_6max_BB_vs_SB';

function renderAt(path: string) {
  return render(
    <MemoryRouter
      initialEntries={[path]}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <Routes>
        <Route path="/charts" element={<ChartsPage />} />
        <Route path="/charts/:rangeId" element={<RangePage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('the vs_limp spot in the index', () => {
  it('gets its own group with a readable name', async () => {
    renderAt('/charts');
    await screen.findByRole('link', { name: new RegExp(RANGE_ID) });
    expect(
      screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)
    ).toContain('Facing a limp');
  });

  it('is filterable by spot like any other', async () => {
    renderAt('/charts?spot=vs_limp');
    expect(await screen.findByText(/^1 of \d+ charts$/)).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: new RegExp(RANGE_ID) })
    ).toBeInTheDocument();
  });

  it('shows 100% VPIP on the card, which is the whole point of the spot', async () => {
    renderAt('/charts');
    const card = await screen.findByRole('link', {
      name: new RegExp(RANGE_ID),
    });
    expect(card).toHaveTextContent('100%');
    expect(card).toHaveTextContent('1326 combos');
  });
});

describe('a fully coloured grid is correct, and says so', () => {
  it('paints every one of the 169 cells', async () => {
    renderAt(`/charts/${RANGE_ID}`);
    await screen.findByRole('grid', { name: RANGE_ID });

    const cells = screen.getAllByRole('gridcell');
    expect(cells).toHaveLength(169);
    expect(cells.every((cell) => cell.dataset['state'] === 'play')).toBe(true);
  });

  it('drops the fold key and states that nothing folds', async () => {
    renderAt(`/charts/${RANGE_ID}`);
    const figure = (
      await screen.findByRole('grid', { name: RANGE_ID })
    ).closest('figure') as HTMLElement;
    const legend = within(figure)
      .getAllByRole('listitem')
      .map((i) => i.textContent);

    expect(legend).toContain('nothing folds — all 169 hands are played');
    expect(legend).not.toContain('fold');
    // Nothing is split either, so the mixed swatch would be equally hollow.
    expect(legend).not.toContain('mixed');
  });

  it('keeps a legend entry per action, so two fills stay distinguishable', async () => {
    renderAt(`/charts/${RANGE_ID}`);
    const figure = (
      await screen.findByRole('grid', { name: RANGE_ID })
    ).closest('figure') as HTMLElement;
    const legend = within(figure)
      .getAllByRole('listitem')
      .map((i) => i.textContent);

    // The zero-cost action carries no size; the other one does.
    expect(legend).toContain('check');
    expect(legend).toContain('raise 3.5bb');
  });

  it('still shows the fold legend on a chart that does fold', async () => {
    renderAt('/charts/rfi_6max_CO');
    const figure = (
      await screen.findByRole('grid', { name: 'rfi_6max_CO' })
    ).closest('figure') as HTMLElement;
    const legend = within(figure)
      .getAllByRole('listitem')
      .map((i) => i.textContent);

    expect(legend).toContain('fold');
    expect(legend).not.toContain('nothing folds — all 169 hands are played');
  });
});

describe('the totals a reader checks against the printed chart', () => {
  it('prints the zero fold line rather than hiding it', async () => {
    renderAt(`/charts/${RANGE_ID}`);
    await screen.findByRole('grid', { name: RANGE_ID });

    const foldRow = screen
      .getByRole('rowheader', { name: 'fold' })
      .closest('tr');
    const cells = within(foldRow!)
      .getAllByRole('cell')
      .map((cell) => cell.textContent);
    // BVB-CALIBRATION §3 prints "Fold 0.0% 0 / 1326" under the grid; a reader
    // comparing our totals needs a row to compare it against.
    expect(cells[0]).toBe('0');
    expect(cells[1]).toBe('0.0%');
  });

  it('reports every combo as played', async () => {
    renderAt(`/charts/${RANGE_ID}`);
    await screen.findByRole('grid', { name: RANGE_ID });

    const playedRow = screen
      .getByRole('rowheader', { name: 'played' })
      .closest('tr');
    const cells = within(playedRow!)
      .getAllByRole('cell')
      .map((cell) => cell.textContent);
    expect(cells[0]).toBe('1326');
    expect(cells[1]).toBe('100.0%');

    expect(screen.getByText(/169 of 169 hands are played/)).toBeInTheDocument();
  });

  it('never renders the zero-cost action as "0bb"', async () => {
    renderAt(`/charts/${RANGE_ID}`);
    await screen.findByRole('grid', { name: RANGE_ID });

    const sizes = screen.getByText('Sizes').nextElementSibling;
    expect(sizes).toHaveTextContent('raise 3.5bb');
    expect(sizes).toHaveTextContent('check no chips');
    expect(sizes?.textContent).not.toMatch(/(^|[^\d.])0(\.0+)?bb/);
  });

  it('shows the file notes verbatim, illustrative warning included', async () => {
    renderAt(`/charts/${RANGE_ID}`);
    await screen.findByRole('grid', { name: RANGE_ID });
    expect(
      screen.getByText(/ILLUSTRATIVE FIXTURE - not a shipped range/)
    ).toBeInTheDocument();
    expect(screen.getByText(/the real chart is 536 raise/)).toBeInTheDocument();
  });
});
