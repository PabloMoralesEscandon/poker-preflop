import { useMemo, useState } from 'react';

import { cn } from '../lib/cn';
import { notationAt, RANKS } from '../lib/hands';

/**
 * The standard 13×13 range chart.
 *
 * It knows nothing about any drill. It is handed a hand → action-frequency map
 * and renders it; action ids are opaque strings, so the same component serves
 * RFI today and `{"call": 0.6, "raise": 0.4}` when the 3-bet drills land.
 *
 * Encoding is composite, never colour alone:
 *  - colour      → which action (categorical, fixed slot order)
 *  - fill height → how often (magnitude)
 *  - hatch       → mixed, so a partial fill is legible in greyscale and to a
 *                  colourblind reader
 */

/** Action id → frequency in `(0, 1]`. A pure fold is `{}`. */
export type HandFrequencies = Record<string, number>;

/** Hand notation → its action frequencies. */
export type HandGridData = Record<string, HandFrequencies>;

export interface HandGridStats {
  combos: number;
  vpip: number;
  hands_played: number;
}

export interface HandGridProps {
  grid: HandGridData;
  /** Action id → CSS colour. Unmapped actions fall back to the series slots. */
  actionColors?: Record<string, string>;
  /** Action id → human label, for the legend. Defaults to the id. */
  actionLabels?: Record<string, string>;
  /** Rendered unmistakably; everything else recedes. */
  highlightedHand?: string | null;
  onCellClick?: (hand: string, frequencies: HandFrequencies) => void;
  /** When supplied, the header shows VPIP and combo count. */
  stats?: HandGridStats;
  /** Accessible name for the chart. */
  label?: string;
  className?: string;
}

/** Fixed slot order. Never cycled — a 5th action needs a real decision. */
const SERIES_SLOTS = [
  'var(--viz-series-1)',
  'var(--viz-series-2)',
  'var(--viz-series-3)',
  'var(--viz-series-4)',
];

const EPSILON = 1e-6;

/** Texture for mixed cells: the encoding that survives greyscale and CVD. */
const HATCH =
  'repeating-linear-gradient(45deg, color-mix(in srgb, var(--canvas) 75%, transparent) 0 1.5px, transparent 1.5px 4px)';

type CellState = 'play' | 'mixed' | 'fold';

function playedFrequency(frequencies: HandFrequencies): number {
  const total = Object.values(frequencies).reduce(
    (sum, value) => sum + value,
    0
  );
  return Math.min(Math.max(total, 0), 1);
}

function cellState(played: number): CellState {
  if (played <= EPSILON) return 'fold';
  if (played >= 1 - EPSILON) return 'play';
  return 'mixed';
}

/**
 * Assigns colours to action ids in a stable order, so a filter that changes
 * which actions are present never repaints the survivors.
 */
function buildColorMap(
  grid: HandGridData,
  overrides: Record<string, string> | undefined
): Record<string, string> {
  const actionIds = new Set<string>();
  for (const frequencies of Object.values(grid)) {
    for (const actionId of Object.keys(frequencies)) actionIds.add(actionId);
  }

  const colors: Record<string, string> = {};
  [...actionIds].sort().forEach((actionId, index) => {
    colors[actionId] =
      overrides?.[actionId] ??
      SERIES_SLOTS[index % SERIES_SLOTS.length] ??
      SERIES_SLOTS[0]!;
  });
  return { ...colors, ...overrides };
}

/** Stacks the actions bottom-up inside the filled part of a cell. */
function fillBackground(
  frequencies: HandFrequencies,
  colors: Record<string, string>,
  played: number
): string | undefined {
  const entries = Object.entries(frequencies)
    .filter(([, value]) => value > 0)
    .sort(([a], [b]) => a.localeCompare(b));

  if (entries.length === 0 || played <= 0) return undefined;
  if (entries.length === 1) return colors[entries[0]![0]];

  const stops: string[] = [];
  let cursor = 0;
  for (const [actionId, value] of entries) {
    const from = (cursor / played) * 100;
    cursor += value;
    const to = (cursor / played) * 100;
    stops.push(`${colors[actionId]} ${from.toFixed(2)}% ${to.toFixed(2)}%`);
  }
  return `linear-gradient(to top, ${stops.join(', ')})`;
}

function describe(
  hand: string,
  frequencies: HandFrequencies,
  labels: Record<string, string> | undefined
): string {
  const entries = Object.entries(frequencies).filter(([, v]) => v > 0);
  if (entries.length === 0) return `${hand}: fold`;
  const parts = entries.map(
    ([actionId, value]) =>
      `${labels?.[actionId] ?? actionId} ${Math.round(value * 100)}%`
  );
  const played = playedFrequency(frequencies);
  if (played < 1 - EPSILON)
    parts.push(`fold ${Math.round((1 - played) * 100)}%`);
  return `${hand}: ${parts.join(', ')}`;
}

export function HandGrid({
  grid,
  actionColors,
  actionLabels,
  highlightedHand = null,
  onCellClick,
  stats,
  label = 'Range chart',
  className,
}: HandGridProps) {
  const [hoveredHand, setHoveredHand] = useState<string | null>(null);

  const colors = useMemo(
    () => buildColorMap(grid, actionColors),
    [grid, actionColors]
  );

  const cells = useMemo(
    () =>
      RANKS.flatMap((_, row) =>
        RANKS.map((__, col) => {
          const hand = notationAt(row, col);
          const frequencies = grid[hand] ?? {};
          const played = playedFrequency(frequencies);
          return {
            hand,
            row,
            col,
            frequencies,
            played,
            state: cellState(played),
            background: fillBackground(frequencies, colors, played),
          };
        })
      ),
    [grid, colors]
  );

  const readoutHand = hoveredHand ?? highlightedHand;
  const readout = readoutHand
    ? describe(readoutHand, grid[readoutHand] ?? {}, actionLabels)
    : null;

  const interactive = onCellClick !== undefined;

  return (
    <figure className={cn('flex flex-col gap-3', className)}>
      <figcaption className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="text-fg text-sm font-semibold">{label}</span>
        {stats ? (
          <span className="text-fg-muted font-mono text-xs">
            VPIP {(stats.vpip * 100).toFixed(1)}% ·{' '}
            {stats.combos.toLocaleString()} combos · {stats.hands_played}/169
            hands
          </span>
        ) : null}
      </figcaption>

      <div
        role="grid"
        aria-label={label}
        className="grid w-full gap-px select-none"
        style={{
          gridTemplateColumns:
            'minmax(0.75rem, auto) repeat(13, minmax(0, 1fr))',
        }}
      >
        <div role="columnheader" aria-label="rank" className="h-3" />
        {RANKS.map((rank) => (
          <div
            key={`col-${rank}`}
            role="columnheader"
            className="text-fg-muted text-center font-mono text-[0.5rem] leading-3 sm:text-[0.625rem]"
          >
            {rank}
          </div>
        ))}

        {RANKS.map((rowRank, row) => (
          <div key={`row-${rowRank}`} role="row" className="contents">
            <div
              role="rowheader"
              className="text-fg-muted flex items-center justify-end pr-1 font-mono text-[0.5rem] sm:text-[0.625rem]"
            >
              {rowRank}
            </div>
            {cells.slice(row * 13, row * 13 + 13).map((cell) => {
              const highlighted = cell.hand === highlightedHand;
              const Tag = interactive ? 'button' : 'div';
              return (
                <Tag
                  key={cell.hand}
                  role="gridcell"
                  data-hand={cell.hand}
                  data-row={cell.row}
                  data-col={cell.col}
                  data-state={cell.state}
                  data-highlighted={highlighted ? 'true' : undefined}
                  aria-label={describe(
                    cell.hand,
                    cell.frequencies,
                    actionLabels
                  )}
                  title={describe(cell.hand, cell.frequencies, actionLabels)}
                  {...(interactive
                    ? {
                        type: 'button' as const,
                        onClick: () => onCellClick(cell.hand, cell.frequencies),
                      }
                    : {})}
                  onMouseEnter={() => setHoveredHand(cell.hand)}
                  onMouseLeave={() => setHoveredHand(null)}
                  onFocus={() => setHoveredHand(cell.hand)}
                  onBlur={() => setHoveredHand(null)}
                  className={cn(
                    'bg-surface-muted relative aspect-square overflow-hidden rounded-[2px]',
                    highlighted
                      ? 'outline-fg z-10 outline-2 outline-offset-1'
                      : 'outline-none',
                    interactive && 'cursor-pointer'
                  )}
                >
                  {cell.played > 0 ? (
                    <span
                      aria-hidden="true"
                      className="absolute inset-x-0 bottom-0 overflow-hidden"
                      style={{
                        height: `${(cell.played * 100).toFixed(2)}%`,
                        background: cell.background,
                      }}
                    >
                      {/* Hatch only the played part, so the fold part stays
                          clean and the notation underneath stays readable. A
                          partial fill plus texture reads as "mixed" without
                          any colour cue. */}
                      {cell.state === 'mixed' ? (
                        <span
                          className="absolute inset-0"
                          style={{
                            background: HATCH,
                          }}
                        />
                      ) : null}
                    </span>
                  ) : null}

                  <span
                    className={cn(
                      'text-fg absolute inset-0 flex items-center justify-center font-mono text-[0.4rem] leading-none sm:text-[0.5rem] md:text-[0.625rem]',
                      highlighted && 'font-bold'
                    )}
                    style={
                      cell.state === 'play'
                        ? { color: 'var(--viz-ink)' }
                        : cell.state === 'mixed'
                          ? // Sits over both the filled and unfilled halves, so
                            // it needs a halo rather than one fixed colour.
                            {
                              textShadow:
                                '0 0 2px var(--canvas), 0 0 2px var(--canvas), 0 0 3px var(--canvas)',
                            }
                          : undefined
                    }
                  >
                    {cell.hand}
                  </span>
                </Tag>
              );
            })}
          </div>
        ))}
      </div>

      <p
        aria-live="polite"
        className="text-fg-muted min-h-4 font-mono text-[0.6875rem] leading-4"
      >
        {readout}
      </p>

      <HandGridLegend
        grid={grid}
        colors={colors}
        actionLabels={actionLabels ?? {}}
      />
    </figure>
  );
}

function HandGridLegend({
  grid,
  colors,
  actionLabels,
}: {
  grid: HandGridData;
  colors: Record<string, string>;
  actionLabels: Record<string, string>;
}) {
  const actionIds = useMemo(() => {
    const ids = new Set<string>();
    for (const frequencies of Object.values(grid)) {
      for (const actionId of Object.keys(frequencies)) ids.add(actionId);
    }
    return [...ids].sort();
  }, [grid]);

  const primary = actionIds[0] ? colors[actionIds[0]] : SERIES_SLOTS[0];

  return (
    <ul className="text-fg-muted flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
      {actionIds.map((actionId) => (
        <li key={actionId} className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="border-line inline-block size-3 rounded-[2px] border"
            style={{ background: colors[actionId] }}
          />
          {actionLabels[actionId] ?? actionId}
        </li>
      ))}

      <li className="flex items-center gap-1.5">
        <span
          aria-hidden="true"
          className="border-line relative inline-block size-3 overflow-hidden rounded-[2px] border"
          style={{
            background: `linear-gradient(to top, ${primary} 0 50%, var(--surface-muted) 50% 100%)`,
          }}
        >
          <span
            className="absolute inset-x-0 bottom-0 h-1/2"
            style={{ background: HATCH }}
          />
        </span>
        mixed
      </li>

      <li className="flex items-center gap-1.5">
        <span
          aria-hidden="true"
          className="bg-surface-muted border-line inline-block size-3 rounded-[2px] border"
        />
        fold
      </li>
    </ul>
  );
}
