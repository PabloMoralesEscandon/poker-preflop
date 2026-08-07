import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';

import { apiClient, type RangeDetail } from '../api';
import { HandGrid } from '../components/HandGrid';
import { ErrorState, LoadingState } from '../components/states';
import { isHandNotation } from '../lib/hands';

/**
 * One range chart, at its own URL, with an optional highlighted hand:
 * `/range/rfi_6max_UTG?hand=K9s`.
 *
 * This is where a missed hand in a summary links to, so the link has to be
 * shareable and survive a reload — hence the hand living in the query string
 * rather than in component state.
 */
export function RangePage() {
  const { rangeId } = useParams<{ rangeId: string }>();
  const [params] = useSearchParams();

  const [range, setRange] = useState<RangeDetail | null>(null);
  const [error, setError] = useState<unknown>(null);

  const requested = params.get('hand');
  const highlighted = requested && isHandNotation(requested) ? requested : null;

  useEffect(() => {
    if (!rangeId) return;
    let cancelled = false;
    setError(null);
    setRange(null);
    apiClient
      .getRange(rangeId)
      .then((detail) => {
        if (!cancelled) setRange(detail);
      })
      .catch((caught: unknown) => {
        if (!cancelled) setError(caught);
      });
    return () => {
      cancelled = true;
    };
  }, [rangeId]);

  return (
    <section className="space-y-5">
      <div className="space-y-1">
        <h1 className="font-mono text-2xl font-semibold tracking-tight">
          {rangeId}
        </h1>
        {highlighted ? (
          <p className="text-fg-muted text-sm">
            Showing <span className="text-fg font-mono">{highlighted}</span> in
            this chart.
          </p>
        ) : null}
      </div>

      {error ? <ErrorState error={error} /> : null}
      {!range && !error ? <LoadingState label="Loading chart…" /> : null}

      {range ? (
        <>
          <HandGrid
            grid={range.grid}
            stats={range.stats}
            label={range.range_id}
            highlightedHand={highlighted}
            actionLabels={Object.fromEntries(
              range.actions.map((actionId) => [actionId, actionId])
            )}
            className="max-w-2xl"
          />
          <p className="text-fg-muted max-w-prose text-xs">{range.notes}</p>
        </>
      ) : null}

      <Link
        to="/"
        className="text-accent inline-block text-sm underline underline-offset-4"
      >
        Back to drills
      </Link>
    </section>
  );
}
