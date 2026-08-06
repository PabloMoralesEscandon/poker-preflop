import { useEffect, useState } from 'react';

import {
  apiClient,
  isApiError,
  type RangeDetail,
  type RangeListItem,
} from '../api';
import { HandGrid } from '../components/HandGrid';
import { ALL_HANDS } from '../lib/hands';

/**
 * Development preview for {@link HandGrid}. It reaches the fixture chart the
 * same way the real app will — through the api client — so nothing outside
 * `src/api/` touches `docs/examples/`.
 */
export function GridPreviewPage() {
  const [ranges, setRanges] = useState<RangeListItem[]>([]);
  const [rangeId, setRangeId] = useState('rfi_6max_CO');
  const [range, setRange] = useState<RangeDetail | null>(null);
  const [highlighted, setHighlighted] = useState<string | null>('AKo');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiClient
      .listRanges({ spot: 'rfi' })
      .then((response) => {
        if (!cancelled) setRanges(response.ranges);
      })
      .catch(() => {
        if (!cancelled) setRanges([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    apiClient
      .getRange(rangeId)
      .then((detail) => {
        if (!cancelled) setRange(detail);
      })
      .catch((caught: unknown) => {
        if (cancelled) return;
        setRange(null);
        setError(isApiError(caught) ? caught.message : 'Failed to load range.');
      });
    return () => {
      cancelled = true;
    };
  }, [rangeId]);

  return (
    <section className="space-y-5">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Hand grid</h1>
        <p className="text-fg-muted max-w-prose text-sm">
          Development preview. The chart component is drill-agnostic: it renders
          a hand → action-frequency map and nothing else.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-fg-muted">Range</span>
          <select
            value={rangeId}
            onChange={(event) => setRangeId(event.target.value)}
            className="border-line bg-surface text-fg rounded-md border px-2 py-1 font-mono text-xs"
          >
            {(ranges.length > 0
              ? ranges.map((entry) => entry.range_id)
              : [rangeId]
            ).map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs">
          <span className="text-fg-muted">Highlighted hand</span>
          <select
            value={highlighted ?? ''}
            onChange={(event) => setHighlighted(event.target.value || null)}
            className="border-line bg-surface text-fg rounded-md border px-2 py-1 font-mono text-xs"
          >
            <option value="">none</option>
            {ALL_HANDS.map((hand) => (
              <option key={hand} value={hand}>
                {hand}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error ? (
        <p className="border-line bg-surface rounded-lg border p-4 text-sm">
          {error}
        </p>
      ) : null}

      {range ? (
        <>
          <HandGrid
            grid={range.grid}
            stats={range.stats}
            label={range.range_id}
            highlightedHand={highlighted}
            actionLabels={{ raise: 'raise' }}
            onCellClick={(hand) => setHighlighted(hand)}
            className="max-w-2xl"
          />
          <p className="text-fg-muted max-w-prose text-xs">{range.notes}</p>
        </>
      ) : null}
    </section>
  );
}
