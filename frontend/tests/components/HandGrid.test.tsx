import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { HandGrid, type HandGridData } from '@/components/HandGrid';
import { ALL_HANDS, handTypeOf, notationAt, RANKS } from '@/lib/hands';

/** A grid with one of each state, and every other hand a pure fold. */
const GRID: HandGridData = Object.fromEntries(
  ALL_HANDS.map((hand) => {
    if (hand === 'AA' || hand === 'AKs' || hand === 'AKo') {
      return [hand, { raise: 1 }];
    }
    if (hand === 'K5s' || hand === 'QTo') return [hand, { raise: 0.5 }];
    return [hand, {}];
  })
);

function cells(): HTMLElement[] {
  return screen.getAllByRole('gridcell');
}

describe('HandGrid layout', () => {
  it('renders all 169 cells, once each', () => {
    render(<HandGrid grid={GRID} />);
    const rendered = cells();
    expect(rendered).toHaveLength(169);

    const hands = rendered.map((cell) => cell.dataset['hand']);
    expect(new Set(hands).size).toBe(169);
    expect([...hands].sort()).toEqual([...ALL_HANDS].sort());
  });

  it('lays the cells out in row-major chart order', () => {
    render(<HandGrid grid={GRID} />);
    const hands = cells().map((cell) => cell.dataset['hand']);

    expect(hands[0]).toBe('AA');
    expect(hands[1]).toBe('AKs');
    expect(hands[13]).toBe('AKo');
    expect(hands[168]).toBe('22');

    for (let row = 0; row < 13; row += 1) {
      for (let col = 0; col < 13; col += 1) {
        expect(hands[row * 13 + col]).toBe(notationAt(row, col));
      }
    }
  });

  it('renders a rank header for every row and column', () => {
    render(<HandGrid grid={GRID} />);
    for (const rank of RANKS) {
      expect(screen.getAllByText(rank).length).toBeGreaterThanOrEqual(2);
    }
  });
});

/**
 * The classic range-grid bug: suited and offsuit swapped. It looks plausible
 * until a poker player sees it, so it is asserted from DOM order — not from an
 * attribute the component sets — for every one of the 169 cells.
 */
describe('HandGrid diagonal', () => {
  it('puts pairs on the diagonal, suited above it, offsuit below it', () => {
    render(<HandGrid grid={GRID} />);
    const hands = cells().map((cell) => cell.dataset['hand'] ?? '');

    for (let index = 0; index < hands.length; index += 1) {
      const row = Math.floor(index / 13);
      const col = index % 13;
      const hand = hands[index] ?? '';
      const type = handTypeOf(hand);

      if (row === col) {
        expect(type, `${hand} at (${row},${col})`).toBe('pair');
      } else if (col > row) {
        expect(type, `${hand} at (${row},${col})`).toBe('suited');
      } else {
        expect(type, `${hand} at (${row},${col})`).toBe('offsuit');
      }
    }
  });

  it('places the specific hands that catch a transposed grid', () => {
    render(<HandGrid grid={GRID} />);
    const at = (hand: string) => {
      const cell = cells().find((entry) => entry.dataset['hand'] === hand);
      return [Number(cell?.dataset['row']), Number(cell?.dataset['col'])];
    };

    // AKs is top row, second column. AKo is second row, first column.
    expect(at('AKs')).toEqual([0, 1]);
    expect(at('AKo')).toEqual([1, 0]);
    // The far corners: 32s top-right, 32o bottom-left.
    expect(at('32s')).toEqual([11, 12]);
    expect(at('32o')).toEqual([12, 11]);
    // Pairs run down the diagonal. Ranks are A K Q J T 9 8 7 6 5 4 3 2, so
    // 88 is index 6 and 77 is index 7.
    expect(at('AA')).toEqual([0, 0]);
    expect(at('88')).toEqual([6, 6]);
    expect(at('77')).toEqual([7, 7]);
    expect(at('22')).toEqual([12, 12]);
  });
});

describe('HandGrid highlighting', () => {
  it('marks exactly the highlighted hand', () => {
    render(<HandGrid grid={GRID} highlightedHand="A5s" />);
    const highlighted = cells().filter(
      (cell) => cell.dataset['highlighted'] === 'true'
    );
    expect(highlighted).toHaveLength(1);
    expect(highlighted[0]?.dataset['hand']).toBe('A5s');
  });

  it('highlights the offsuit cell when an offsuit hand is given', () => {
    render(<HandGrid grid={GRID} highlightedHand="QTo" />);
    const highlighted = cells().find(
      (cell) => cell.dataset['highlighted'] === 'true'
    );
    expect(highlighted?.dataset['hand']).toBe('QTo');
    expect(Number(highlighted?.dataset['row'])).toBeGreaterThan(
      Number(highlighted?.dataset['col'])
    );
  });

  it('highlights nothing when no hand is given', () => {
    render(<HandGrid grid={GRID} />);
    expect(
      cells().filter((cell) => cell.dataset['highlighted'] === 'true')
    ).toHaveLength(0);
  });
});

describe('HandGrid encoding', () => {
  it('distinguishes pure play, mixed and pure fold', () => {
    render(<HandGrid grid={GRID} />);
    const stateOf = (hand: string) =>
      cells().find((cell) => cell.dataset['hand'] === hand)?.dataset['state'];

    expect(stateOf('AA')).toBe('play');
    expect(stateOf('AKo')).toBe('play');
    expect(stateOf('K5s')).toBe('mixed');
    expect(stateOf('QTo')).toBe('mixed');
    expect(stateOf('72o')).toBe('fold');
  });

  it('describes each cell for screen readers and tooltips', () => {
    render(<HandGrid grid={GRID} />);
    const labelOf = (hand: string) =>
      cells()
        .find((cell) => cell.dataset['hand'] === hand)
        ?.getAttribute('aria-label');

    expect(labelOf('AA')).toBe('AA: raise 100%');
    expect(labelOf('K5s')).toBe('K5s: raise 50%, fold 50%');
    expect(labelOf('72o')).toBe('72o: fold');
  });

  it('uses the supplied action labels in the description and legend', () => {
    render(<HandGrid grid={GRID} actionLabels={{ raise: 'Open' }} />);
    const cell = cells().find((entry) => entry.dataset['hand'] === 'AA');
    expect(cell?.getAttribute('aria-label')).toBe('AA: Open 100%');
    expect(screen.getByText('Open')).toBeInTheDocument();
  });
});

describe('HandGrid drill-agnosticism', () => {
  it('renders action ids it has never seen, with no RFI knowledge', () => {
    const grid: HandGridData = Object.fromEntries(
      ALL_HANDS.map((hand) => [hand, {} as Record<string, number>])
    );
    grid['AA'] = { raise: 0.4, call: 0.6 };
    grid['KK'] = { call: 1 };
    grid['QQ'] = { squeeze: 0.25 };

    render(<HandGrid grid={grid} />);

    const stateOf = (hand: string) =>
      cells().find((cell) => cell.dataset['hand'] === hand)?.dataset['state'];
    expect(stateOf('AA')).toBe('play');
    expect(stateOf('KK')).toBe('play');
    expect(stateOf('QQ')).toBe('mixed');

    // The legend is built from the data, not from a hardcoded action list.
    for (const actionId of ['call', 'raise', 'squeeze']) {
      expect(screen.getByText(actionId)).toBeInTheDocument();
    }
  });

  it('tolerates a grid missing keys, treating them as folds', () => {
    render(<HandGrid grid={{ AA: { raise: 1 } }} />);
    expect(cells()).toHaveLength(169);
    const stateOf = (hand: string) =>
      cells().find((cell) => cell.dataset['hand'] === hand)?.dataset['state'];
    expect(stateOf('AA')).toBe('play');
    expect(stateOf('72o')).toBe('fold');
  });
});

describe('HandGrid header and interaction', () => {
  it('shows VPIP and combo count when stats are supplied', () => {
    render(
      <HandGrid
        grid={GRID}
        stats={{ combos: 328, vpip: 0.2474, hands_played: 65 }}
      />
    );
    const header = screen.getByText(/VPIP/);
    expect(header).toHaveTextContent('VPIP 24.7%');
    expect(header).toHaveTextContent('328 combos');
    expect(header).toHaveTextContent('65/169 hands');
  });

  it('omits the stats header when no stats are supplied', () => {
    render(<HandGrid grid={GRID} />);
    expect(screen.queryByText(/VPIP/)).not.toBeInTheDocument();
  });

  it('uses the label as the accessible name of the chart', () => {
    render(<HandGrid grid={GRID} label="rfi_6max_CO" />);
    expect(
      screen.getByRole('grid', { name: 'rfi_6max_CO' })
    ).toBeInTheDocument();
  });

  it('reports the clicked hand and its frequencies', async () => {
    const onCellClick = vi.fn();
    render(<HandGrid grid={GRID} onCellClick={onCellClick} />);

    const cell = cells().find((entry) => entry.dataset['hand'] === 'K5s');
    await userEvent.click(cell!);

    expect(onCellClick).toHaveBeenCalledExactlyOnceWith('K5s', { raise: 0.5 });
  });

  it('renders non-interactive cells when no click handler is given', () => {
    render(<HandGrid grid={GRID} />);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });
});
