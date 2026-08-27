import { describe, expect, it } from 'vitest';

import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import { RangePage } from '@/pages/RangePage';

/**
 * The PLO chart page renders the class-matrix view, not the 13x13 Hold'em
 * grid. The module-level apiClient is the mock in tests (vite.config sets
 * VITE_API_MODE=mock), and its BTN PLO chart is fixture-backed.
 */
function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/charts/:rangeId" element={<RangePage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('RangePage with a PLO range', () => {
  it('renders the class matrix for a plo range id', async () => {
    renderAt('/charts/rfi_plo_6max_BTN');

    expect(
      (await screen.findAllByText('rfi_plo_6max_BTN')).length
    ).toBeGreaterThan(0);
    expect(
      await screen.findByRole('gridcell', {
        name: 'AA.ds: raise 3.5bb 100%',
      })
    ).toBeInTheDocument();
    expect(screen.getByText(/45\/47 classes/)).toBeInTheDocument();
    // The Hold'em grid is not rendered for a PLO chart.
    expect(document.querySelector('[data-hand="AKo"]')).toBeNull();
  });
});
