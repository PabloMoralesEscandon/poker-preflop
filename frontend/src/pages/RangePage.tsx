import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';

import { apiClient, type RangeDetail, type SourceInfo } from '../api';
import { HandGrid } from '../components/HandGrid';
import { Provenance } from '../components/Provenance';
import { ErrorState, LoadingState } from '../components/states';
import { isHandNotation } from '../lib/hands';

/**
 * One chart, at its own URL, with everything needed to audit it:
 * `/charts/rfi_6max_UTG`, optionally `?hand=K9s` to highlight a cell.
 *
 * Both the grid and the provenance come from the same `GET /ranges/{id}`
 * payload. That is deliberate — showing one source's totals beside another
 * source's grid is the exact failure this screen exists to catch, so it is made
 * impossible by construction rather than by care.
 *
 * A missed hand in a session summary links here, so the URL has to be
 * shareable and survive a reload; hence the hand living in the query string.
 */
export function RangePage() {
  const { rangeId } = useParams<{ rangeId: string }>();
  const [params] = useSearchParams();

  const [range, setRange] = useState<RangeDetail | null>(null);
  const [source, setSource] = useState<SourceInfo | null>(null);
  const [error, setError] = useState<unknown>(null);

  const requested = params.get('hand');
  const highlighted = requested && isHandNotation(requested) ? requested : null;

  useEffect(() => {
    if (!rangeId) return;
    let cancelled = false;
    setError(null);
    setRange(null);
    setSource(null);

    apiClient
      .getRange(rangeId)
      .then(async (detail) => {
        if (cancelled) return;
        setRange(detail);
        // The register is supporting detail: a chart with an unknown source is
        // still worth showing, loudly labelled as unverified.
        const { sources } = await apiClient.getSources().catch(() => ({
          sources: [] as SourceInfo[],
        }));
        if (cancelled) return;
        setSource(
          sources.find((entry) => entry.source_id === detail.source_id) ?? null
        );
      })
      .catch((caught: unknown) => {
        if (!cancelled) setError(caught);
      });

    return () => {
      cancelled = true;
    };
  }, [rangeId]);

  const title = range
    ? range.vs_position
      ? `${range.position} vs ${range.vs_position}`
      : range.position
    : rangeId;

  return (
    <section className="space-y-5">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="text-fg-muted font-mono text-sm">{rangeId}</p>
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
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <HandGrid
            grid={range.grid}
            stats={range.stats}
            label={range.range_id}
            highlightedHand={highlighted}
            actionLabels={Object.fromEntries(
              range.actions.map((actionId) => [
                actionId,
                range.action_sizes_bb[actionId] === undefined
                  ? actionId
                  : `${actionId} ${range.action_sizes_bb[actionId]}bb`,
              ])
            )}
          />
          <Provenance range={range} source={source} />
        </div>
      ) : null}

      <Link
        to="/charts"
        className="text-accent inline-block text-sm underline underline-offset-4"
      >
        All charts
      </Link>
    </section>
  );
}
