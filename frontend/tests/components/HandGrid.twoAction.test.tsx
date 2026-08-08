import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import vsRfi from '@fixtures/range_vs_rfi_6max_BB_vs_BTN.json';

import { HandGrid, type HandGridData } from '@/components/HandGrid';

const GRID = (vsRfi as { grid: HandGridData }).grid;

describe('HandGrid with a two-action range, unmodified', () => {
  it('renders both actions as distinct fills', () => {
    render(<HandGrid grid={GRID} />);
    const cells = screen.getAllByRole('gridcell');
    const fillOf = (hand: string) => {
      const cell = cells.find((c) => c.dataset['hand'] === hand);
      const fill = cell?.querySelector('span[aria-hidden]') as HTMLElement;
      return fill?.style.background;
    };
    const threeBet = Object.keys(GRID).find((h) => GRID[h]?.['3bet']);
    const call = Object.keys(GRID).find((h) => GRID[h]?.['call']);
    expect(threeBet).toBeDefined();
    expect(call).toBeDefined();
    expect(fillOf(threeBet!)).not.toBe(fillOf(call!));
    expect(fillOf(threeBet!)).toBeTruthy();
  });

  it('builds a legend from the data with both actions', () => {
    render(<HandGrid grid={GRID} />);
    expect(screen.getByText('3bet')).toBeInTheDocument();
    expect(screen.getByText('call')).toBeInTheDocument();
    expect(screen.getByText('fold')).toBeInTheDocument();
  });

  it('describes each cell with the right action', () => {
    render(<HandGrid grid={GRID} />);
    const cells = screen.getAllByRole('gridcell');
    const label = (hand: string) =>
      cells.find((c) => c.dataset['hand'] === hand)?.getAttribute('aria-label');
    const threeBet = Object.keys(GRID).find((h) => GRID[h]?.['3bet'])!;
    expect(label(threeBet)).toContain('3bet');
  });
});
