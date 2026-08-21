import { useMemo, useState } from 'react';

import type { ActionFrequencies, RangeGrid, RangeStats } from '../api';
import { cn } from '../lib/cn';
import {
  PLO_CLASS_KEYS,
  PLO_PAIR_TIERS,
  PLO_NON_PAIR_SHAPES,
  PLO_TEXTURES,
} from '../lib/hands-plo';

/**
 * A PLO range chart.
 *
 * PLO has 270,725 concrete hands, so there is no 13x13 grid to draw. Ranges
 * are keyed by one of the 47 class keys instead (RANGE-DATA-FORMAT §10), and
 * this view lays them out as two matrices — pair tiers and non-pair shapes —
 * by suit texture, plus the fold-only trips/quads classes.
 *
 * The visual language matches {@link HandGrid}: series colours per action,
 * hatching on mixed cells, and the same aria-label grammar, so a chart reads
 * the same way regardless of game.
 */

const SERIES_SLOTS = [
  'var(--viz-series-1)',
  'var(--viz-series-2)',
  'var(--viz-series-3)',
  'var(--viz-series-4)',
];

const EPSILON = 1e-6;

const HATCH =
  'repeating-linear-gradient(45deg, color-mix(in srgb, var(--canvas) 75%, transparent) 0 1.5px, transparent 1.5px 4px)';

const SHAPE_LABELS: Record<string, string> = {
  AA: 'Aces',
  KK: 'Kings',
  QQ: 'Queens',
  JJ: 'Jacks',
  TT: 'Tens',
  '99-66': 'Nines through sixes',
  '55-22': 'Fives through deuces',
  '0G': 'Zero-gap rundown',
  '1G': 'One-gap rundown',
  '2G': 'Two-gap rundown',
  'A-KT': 'Ace + two broadway',
  'A-96': 'Ace + two mids',
  'A-52': 'Wheel ace',
  OA: 'Other ace-high',
  Oth: 'Disconnected',
};

interface PloRangeViewProps {
  grid: RangeGrid;
  stats?: RangeStats;
  label?: string;
  highlightedKey?: string | null;
  actionLabels?: Record<string, string>;
  onCellClick?: (key: string, frequencies: ActionFrequencies) => void;
  className?: string;
}

function playedOf(frequencies: ActionFrequencies): number {
  const total = Object.values(frequencies).reduce(
    (sum, value) => sum + value,
    0
  );
  return Math.min(Math.max(total, 0), 1);
}

function stateOf(played: number): 'play' | 'mixed' | 'fold' {
  if (played <= EPSILON) return 'fold';
  if (played >= 1 - EPSILON) return 'play';
  return 'mixed';
}

function describe(
  key: string,
  frequencies: ActionFrequencies,
  labels: Record<string, string> | undefined
): string {
  const entries = Object.entries(frequencies).filter(([, v]) => v > 0);
  if (entries.length === 0) return `${key}: fold`;
  const parts = entries.map(
    ([actionId, value]) =>
      `${labels?.[actionId] ?? actionId} ${Math.round(value * 100)}%`
  );
  const played = playedOf(frequencies);
  if (played < 1 - EPSILON)
    parts.push(`fold ${Math.round((1 - played) * 100)}%`);
  return `${key}: ${parts.join(', ')}`;
}

export function PloRangeView({
  grid,
  stats,
  label,
  highlightedKey,
  actionLabels,
  onCellClick,
  className,
}: PloRangeViewProps) {
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);

  const colors = useMemo(() => {
    const actionIds = new Set<string>();
    for (const key of PLO_CLASS_KEYS) {
      for (const actionId of Object.keys(grid[key] ?? {})) {
        actionIds.add(actionId);
      }
    }
    const map: Record<string, string> = {};
    [...actionIds].sort().forEach((actionId, index) => {
      map[actionId] =
        actionLabels?.[actionId] !== undefined
          ? SERIES_SLOTS[index % SERIES_SLOTS.length]!
          : (SERIES_SLOTS[index % SERIES_SLOTS.length] ?? SERIES_SLOTS[0]!);
    });
    return { ...map };
  }, [grid, actionLabels]);

  const readoutKey = hoveredKey ?? highlightedKey;

  const renderCell = (key: string) => {
    const frequencies = grid[key] ?? {};
    const played = playedOf(frequencies);
    const state = stateOf(played);
    const highlighted = key === highlightedKey;
    const interactive = onCellClick !== undefined;
    const Tag = interactive ? 'button' : 'div';

    const stacked = Object.entries(frequencies)
      .filter(([, value]) => value > 0)
      .sort(([a], [b]) => a.localeCompare(b));
    let background: string | undefined;
    if (stacked.length === 1) {
      background = colors[stacked[0]![0]];
    } else if (stacked.length > 1) {
      const stops: string[] = [];
      let cursor = 0;
      for (const [actionId, value] of stacked) {
        const from = (cursor / played) * 100;
        cursor += value;
        const to = (cursor / played) * 100;
        stops.push(`${colors[actionId]} ${from.toFixed(2)}% ${to.toFixed(2)}%`);
      }
      background = `linear-gradient(to top, ${stops.join(', ')})`;
    }

    return (
      <Tag
        key={key}
        type={interactive ? 'button' : undefined}
        role="gridcell"
        data-key={key}
        data-state={state}
        data-highlighted={highlighted ? 'true' : undefined}
        aria-label={describe(key, frequencies, actionLabels)}
        onMouseEnter={() => setHoveredKey(key)}
        onMouseLeave={() => setHoveredKey(null)}
        onFocus={() => setHoveredKey(key)}
        onBlur={() => setHoveredKey(null)}
        onClick={
          interactive
            ? () => onCellClick(key, frequencies)
            : undefined
        }
        className={cn(
          'border-line relative flex min-h-11 flex-col items-center justify-center gap-0.5 border font-mono text-[0.625rem]',
          state === 'fold' && 'text-fg-muted bg-transparent',
          state === 'mixed' && 'text-canvas font-semibold',
          highlighted && 'ring-accent ring-2 ring-offset-1'
        )}
        style={{
          background:
            background ?? (state === 'mixed' ? HATCH : undefined),
        }}
      >
        <span>{key}</span>
        {played > EPSILON && (
          <span className="opacity-80">{Math.round(played * 100)}%</span>
        )}
      </Tag>
    );
  };

  const matrix = (shapes: readonly string[], caption: string) => (
    <div
      role="grid"
      aria-label={`${caption} classes`}
      className="border-line grid w-full grid-cols-[minmax(7rem,auto)_repeat(3,minmax(0,1fr))] gap-px border"
    >
      <div role="columnheader" className="bg-canvas p-1.5 text-left" />
      {PLO_TEXTURES.map((texture) => (
        <div
          key={texture}
          role="columnheader"
          className="text-fg-muted bg-canvas p-1.5 text-center font-mono text-xs uppercase"
        >
          {texture}
        </div>
      ))}
      {shapes.map((shape) => (
        <div key={shape} role="row" className="contents">
          <div
            role="rowheader"
            className="text-fg-muted bg-canvas flex items-center justify-start p-1.5 font-mono text-xs"
            title={SHAPE_LABELS[shape]}
          >
            {shape}
          </div>
          {PLO_TEXTURES.map((texture) => renderCell(`${shape}.${texture}`))}
        </div>
      ))}
    </div>
  );

  return (
    <figure className={cn('flex flex-col gap-3', className)}>
      <figcaption className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="text-fg text-sm font-semibold">{label}</span>
        {stats ? (
          <span className="text-fg-muted font-mono text-xs">
            VPIP {(stats.vpip * 100).toFixed(1)}% ·{' '}
            {stats.combos.toLocaleString()} combos · {stats.hands_played}/47
            classes
          </span>
        ) : null}
      </figcaption>

      {matrix(PLO_PAIR_TIERS, 'Pair')}
      {matrix(PLO_NON_PAIR_SHAPES, 'Non-pair')}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        {readoutKey ? (
          <span
            className="text-fg font-mono"
            aria-live="polite"
          >
            {describe(readoutKey, grid[readoutKey] ?? {}, actionLabels)}
          </span>
        ) : (
          <span className="text-fg-muted font-mono">
            Trips and quads fold at every seat in these charts.
          </span>
        )}
      </div>
    </figure>
  );
}
