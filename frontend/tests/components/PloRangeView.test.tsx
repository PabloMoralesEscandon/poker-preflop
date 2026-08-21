import { describe, expect, it, vi } from 'vitest';

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { PloRangeView } from '@/components/PloRangeView';
import { PLO_CLASS_KEYS } from '@/lib/hands-plo';
import type { RangeGrid } from '@/api';

const GRID: RangeGrid = {};
for (const key of PLO_CLASS_KEYS) GRID[key] = {};
GRID['AA.ds'] = { raise: 1 };
GRID['AA.ss'] = { raise: 0.5 };

const STATS = {
  combos: 124162.608,
  vpip: 0.4586,
  hands_played: 45,
  by_action: { raise: 124162.608 },
};

import { PLO_PAIR_TIERS, PLO_NON_PAIR_SHAPES, PLO_TEXTURES } from '@/lib/hands-plo';

/** The matrices render shape x texture cells; Trips/Quads stay prose-only. */
const CELL_KEYS = [
  ...PLO_PAIR_TIERS,
  ...PLO_NON_PAIR_SHAPES,
].flatMap((shape) => PLO_TEXTURES.map((tex) => `${shape}.${tex}`));

describe('PloRangeView', () => {
  it('renders one cell per shape-texture key exactly once', () => {
    render(<PloRangeView grid={GRID} stats={STATS} label="rfi_plo_6max_BTN" />);
    expect(CELL_KEYS).toHaveLength(45);
    for (const key of CELL_KEYS) {
      expect(screen.getByRole('gridcell', { name: new RegExp(`^${key}:`) }))
        .toBeDefined();
    }
  });

  it('describes folds, pure plays and mixes in the aria labels', () => {
    render(<PloRangeView grid={GRID} label="x" />);
    expect(
      screen.getByRole('gridcell', { name: 'AA.ds: raise 100%' })
    ).toHaveAttribute('data-state', 'play');
    expect(
      screen.getByRole('gridcell', { name: 'AA.ss: raise 50%, fold 50%' })
    ).toHaveAttribute('data-state', 'mixed');
    expect(
      screen.getByRole('gridcell', { name: 'Oth.r: fold' })
    ).toHaveAttribute('data-state', 'fold');
    // Trips and quads have no cells; they are explained in the readout.
    expect(screen.queryByRole('gridcell', { name: /^Trips:/ })).toBeNull();
  });

  it('shows the class-key stats line against the 47 classes', () => {
    render(<PloRangeView grid={GRID} stats={STATS} label="x" />);
    expect(screen.getByText(/45\/47 classes/)).toBeInTheDocument();
    expect(screen.getByText(/VPIP 45\.9%/)).toBeInTheDocument();
  });

  it('highlights a requested class key and reports it on hover readout', async () => {
    const user = userEvent.setup();
    render(<PloRangeView grid={GRID} highlightedKey="AA.ds" label="x" />);
    const cell = screen.getByRole('gridcell', { name: 'AA.ds: raise 100%' });
    expect(cell).toHaveAttribute('data-highlighted', 'true');

    await user.hover(screen.getByRole('gridcell', { name: 'KK.ds: fold' }));
    expect(screen.getByText('KK.ds: fold')).toBeInTheDocument();
  });

  it('emits clicks with the cell frequencies when interactive', async () => {
    const onCellClick = vi.fn();
    const user = userEvent.setup();
    render(
      <PloRangeView grid={GRID} onCellClick={onCellClick} label="x" />
    );
    await user.click(
      screen.getByRole('gridcell', { name: 'AA.ss: raise 50%, fold 50%' })
    );
    expect(onCellClick).toHaveBeenCalledExactlyOnceWith('AA.ss', {
      raise: 0.5,
    });
  });

  it('accepts custom action labels in labels and legend text', () => {
    render(
      <PloRangeView
        grid={GRID}
        actionLabels={{ raise: 'Raise 3.5' }}
        label="x"
      />
    );
    expect(
      screen.getByRole('gridcell', { name: 'AA.ds: Raise 3.5 100%' })
    ).toBeDefined();
  });
});
