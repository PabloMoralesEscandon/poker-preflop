import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/api';
import { MockApiClient } from '@/api/mock';
import { ChartsPage } from '@/pages/ChartsPage';
import { RangePage } from '@/pages/RangePage';

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

describe('the chart index', () => {
  it('lists every stored range', async () => {
    renderAt('/charts');
    // role=status is also the loading label, so wait for the count itself.
    expect(await screen.findByText(/\d+ of \d+ charts/)).toBeInTheDocument();
    expect(
      await screen.findByRole('link', { name: /\brfi_6max_CO\b/ })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /vs_rfi_6max_BB_vs_BTN\b/ })
    ).toBeInTheDocument();
  });

  it('groups by spot and then by table format', async () => {
    renderAt('/charts');
    await screen.findByRole('link', { name: /\brfi_6max_CO\b/ });

    const headings = screen
      .getAllByRole('heading', { level: 2 })
      .map((heading) => heading.textContent);
    expect(headings).toContain('Raise first in');
    expect(headings).toContain('Facing a raise');

    expect(
      screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)
    ).toContain('6max');
  });

  it('names the source on each card, and flags the ones that are not cited', async () => {
    renderAt('/charts');
    const card = await screen.findByRole('link', {
      name: /vs_rfi_6max_BB_vs_BTN\b/,
    });
    expect(card).toHaveTextContent('Illustrative fixture data');
    expect(card).toHaveTextContent('unverified');
  });

  it('shows each range totals without opening it', async () => {
    renderAt('/charts');
    const card = await screen.findByRole('link', {
      name: /vs_rfi_6max_BB_vs_BTN\b/,
    });
    expect(card).toHaveTextContent('586 combos');
    expect(card).toHaveTextContent('44.2%');
  });

  it('filters by spot, and keeps the filter in the URL', async () => {
    renderAt('/charts');
    await screen.findByRole('link', { name: /\brfi_6max_CO\b/ });

    await userEvent.selectOptions(screen.getByLabelText('Spot'), 'vs_rfi');

    await waitFor(() =>
      expect(
        screen.queryByRole('link', { name: /\brfi_6max_CO\b/ })
      ).not.toBeInTheDocument()
    );
    expect(
      screen.getByRole('link', { name: /vs_rfi_6max_BB_vs_BTN\b/ })
    ).toBeInTheDocument();
  });

  it('filters by position', async () => {
    renderAt('/charts');
    await screen.findByRole('link', { name: /\brfi_6max_CO\b/ });

    // BTN is hero in the Hold'em RFI chart, in three vs_rfi matchups, and in
    // the PLO RFI chart.
    await userEvent.selectOptions(screen.getByLabelText('Position'), 'BTN');
    await waitFor(() =>
      expect(screen.getByText(/\d+ of \d+ charts/)).toHaveTextContent('5 of')
    );
    expect(
      screen.getAllByRole('link', { name: /_6max_BTN/ }).length
    ).toBeGreaterThan(0);
  });

  it('opens filtered from a link, so a filtered view is shareable', async () => {
    renderAt('/charts?spot=vs_rfi');
    await screen.findByRole('link', { name: /vs_rfi_6max_BB_vs_BTN\b/ });
    expect(
      screen.queryByRole('link', { name: /\brfi_6max_CO\b/ })
    ).not.toBeInTheDocument();
  });

  it('still lists charts when the server cannot serve provenance yet', async () => {
    const failing = vi
      .spyOn(MockApiClient.prototype, 'getSources')
      .mockRejectedValue(new ApiError('invalid_request', 'No /sources.', 400));

    renderAt('/charts');
    const card = await screen.findByRole('link', { name: /\brfi_6max_CO\b/ });
    expect(card).toHaveTextContent('Unknown source');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    failing.mockRestore();
  });

  it('says so rather than showing nothing when a filter matches none', async () => {
    renderAt('/charts?spot=vs_rfi&position=UTG');
    expect(await screen.findByText(/No chart matches/)).toBeInTheDocument();
  });
});

describe('one chart, deep-linked', () => {
  it('renders the grid and the provenance from the same payload', async () => {
    renderAt('/charts/vs_rfi_6max_BB_vs_BTN');

    expect(
      await screen.findByRole('heading', { level: 1, name: 'BB vs BTN' })
    ).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('grid')).toBeInTheDocument());
    expect(screen.getAllByRole('gridcell')).toHaveLength(169);
    expect(
      screen.getByRole('region', { name: 'Provenance' })
    ).toBeInTheDocument();
  });

  it('highlights a hand passed in the query string', async () => {
    renderAt('/charts/rfi_6max_CO?hand=AKo');
    await waitFor(() => expect(screen.getByRole('grid')).toBeInTheDocument());

    const highlighted = screen
      .getAllByRole('gridcell')
      .filter((cell) => cell.dataset['highlighted'] === 'true');
    expect(highlighted).toHaveLength(1);
    expect(highlighted[0]?.dataset['hand']).toBe('AKo');
  });

  it('ignores a hand that is not real notation', async () => {
    renderAt('/charts/rfi_6max_CO?hand=ZZZ');
    await waitFor(() => expect(screen.getByRole('grid')).toBeInTheDocument());
    expect(
      screen
        .getAllByRole('gridcell')
        .filter((cell) => cell.dataset['highlighted'] === 'true')
    ).toHaveLength(0);
  });

  it('reports an unknown range instead of rendering an empty chart', async () => {
    renderAt('/charts/nope');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      /Chart not available/
    );
  });
});

/**
 * The audit surface. Every number a reader compares against a published chart
 * has to be on screen, in the units the chart prints, without arithmetic.
 */
describe('the provenance block', () => {
  async function openTwoActionChart() {
    renderAt('/charts/vs_rfi_6max_BB_vs_BTN');
    return within(await screen.findByRole('region', { name: 'Provenance' }));
  }

  it('names the source, its role, and when it was verified', async () => {
    const panel = await openTwoActionChart();
    expect(panel.getByText('Illustrative fixture data')).toBeInTheDocument();
    expect(panel.getByText('Illustrative fixture')).toBeInTheDocument();
    expect(panel.getByText('never')).toBeInTheDocument();
  });

  it('shows the range file own notes verbatim', async () => {
    const panel = await openTwoActionChart();
    expect(
      panel.getByText(/ILLUSTRATIVE FIXTURE - not a shipped range/)
    ).toBeInTheDocument();
  });

  it('shows stack depth and every action size', async () => {
    const panel = await openTwoActionChart();
    expect(panel.getByText('100bb')).toBeInTheDocument();
    expect(panel.getByText(/3bet 4bb/)).toBeInTheDocument();
    expect(panel.getByText(/call 2.5bb/)).toBeInTheDocument();
    expect(panel.getByText('2.5bb')).toBeInTheDocument();
  });

  it('gives per-action combos and percentages, so nobody has to divide', async () => {
    const panel = await openTwoActionChart();

    const threeBet = panel.getByRole('row', { name: /^3bet/ });
    expect(threeBet).toHaveTextContent('50');
    expect(threeBet).toHaveTextContent('3.8%'); // 50 / 1326
    expect(threeBet).toHaveTextContent('8.5%'); // 50 / 586 played

    const call = panel.getByRole('row', { name: /^call/ });
    expect(call).toHaveTextContent('536');
    expect(call).toHaveTextContent('40.4%');

    const played = panel.getByRole('row', { name: /^played/ });
    expect(played).toHaveTextContent('586');
    expect(played).toHaveTextContent('44.2%');
  });

  it('accounts for the folded remainder too', async () => {
    const panel = await openTwoActionChart();
    const fold = panel.getByRole('row', { name: /^fold/ });
    expect(fold).toHaveTextContent('740'); // 1326 - 586
    expect(fold).toHaveTextContent('55.8%');
  });

  it('links out to the published source when there is one', async () => {
    renderAt('/charts/rfi_6max_CO');
    const panel = within(
      await screen.findByRole('region', { name: 'Provenance' })
    );
    const link = panel.queryByRole('link');
    if (link) {
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute(
        'rel',
        expect.stringContaining('noreferrer')
      );
    } else {
      expect(panel.getByText(/not published anywhere/)).toBeInTheDocument();
    }
  });
});

/**
 * The reason HandGrid was reused rather than forked: two non-fold actions have
 * to be legible on the shared component.
 */
describe('a two-action chart', () => {
  it('renders call and 3bet as different fills with a legend', async () => {
    renderAt('/charts/vs_rfi_6max_BB_vs_BTN');
    await waitFor(() => expect(screen.getByRole('grid')).toBeInTheDocument());

    const cells = screen.getAllByRole('gridcell');
    const fill = (hand: string) =>
      (
        cells
          .find((cell) => cell.dataset['hand'] === hand)
          ?.querySelector('span[aria-hidden]') as HTMLElement | null
      )?.style.background;

    // From the fixture: AA 3-bets, A9s calls.
    expect(fill('AA')).toBeTruthy();
    expect(fill('A9s')).toBeTruthy();
    expect(fill('AA')).not.toBe(fill('A9s'));

    // The legend belongs to the grid figure, not the provenance table.
    const legend = within(screen.getByRole('grid').closest('figure')!);
    expect(legend.getByText(/^3bet/)).toBeInTheDocument();
    expect(legend.getByText(/^call/)).toBeInTheDocument();
  });
});

/**
 * FE-12: the browser has to be reachable and pageable without a mouse.
 */
describe('paging through charts from the keyboard', () => {
  it('offers previous and next links naming the neighbouring charts', async () => {
    renderAt('/charts/rfi_6max_HJ');
    const nav = await screen.findByRole('navigation', { name: 'Chart paging' });

    const links = within(nav).getAllByRole('link');
    expect(links.map((link) => link.getAttribute('rel'))).toContain('previous');
    expect(links.map((link) => link.getAttribute('rel'))).toContain('next');
    expect(
      within(nav).getByRole('link', { name: /Previous chart/ })
    ).toHaveAttribute('href', '/charts/rfi_6max_UTG');
    expect(
      within(nav).getByRole('link', { name: /Next chart/ })
    ).toHaveAttribute('href', '/charts/rfi_6max_CO');
  });

  it('advertises its key bindings', async () => {
    renderAt('/charts/rfi_6max_HJ');
    const nav = await screen.findByRole('navigation', { name: 'Chart paging' });
    expect(
      within(nav).getByRole('link', { name: /Previous chart/ })
    ).toHaveAttribute('aria-keyshortcuts', 'ArrowLeft');
    expect(
      within(nav).getByRole('link', { name: /Next chart/ })
    ).toHaveAttribute('aria-keyshortcuts', 'ArrowRight');
  });

  it('moves to the next chart on ArrowRight', async () => {
    renderAt('/charts/rfi_6max_HJ');
    await screen.findByRole('navigation', { name: 'Chart paging' });

    await userEvent.keyboard('{ArrowRight}');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'CO' })
    ).toBeInTheDocument();
  });

  it('moves back on ArrowLeft', async () => {
    renderAt('/charts/rfi_6max_HJ');
    await screen.findByRole('navigation', { name: 'Chart paging' });

    await userEvent.keyboard('{ArrowLeft}');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'UTG' })
    ).toBeInTheDocument();
  });

  it('stops at the ends rather than wrapping', async () => {
    renderAt('/charts/rfi_6max_UTG');
    const nav = await screen.findByRole('navigation', { name: 'Chart paging' });
    expect(
      within(nav).queryByRole('link', { name: /Previous chart/ })
    ).not.toBeInTheDocument();

    await userEvent.keyboard('{ArrowLeft}');
    expect(
      screen.getByRole('heading', { level: 1, name: 'UTG' })
    ).toBeInTheDocument();
  });

  it('leaves the filter selects usable with the keyboard', async () => {
    renderAt('/charts');
    const spot = await screen.findByLabelText('Spot');
    spot.focus();
    expect(spot).toHaveFocus();
    await userEvent.selectOptions(spot, 'vs_rfi');
    expect(spot).toHaveValue('vs_rfi');
  });
});
