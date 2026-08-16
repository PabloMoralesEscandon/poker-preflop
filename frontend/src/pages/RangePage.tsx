import { useEffect, useMemo, useState } from 'react';
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router-dom';

import {
  apiClient,
  type RangeDetail,
  type RangeListItem,
  type SourceInfo,
} from '../api';
import { HandGrid } from '../components/HandGrid';
import { Provenance } from '../components/Provenance';
import { ErrorState, LoadingState } from '../components/states';
import { formatBb } from '../lib/bb';
import { isHandNotation } from '../lib/hands';
import { useKeyboardShortcuts } from '../lib/useKeyboardShortcuts';

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

  const navigate = useNavigate();
  const [range, setRange] = useState<RangeDetail | null>(null);
  const [source, setSource] = useState<SourceInfo | null>(null);
  const [siblings, setSiblings] = useState<RangeListItem[]>([]);
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

    // The neighbours, so the chart can be paged through without going back to
    // the index. Failure here costs the prev/next links, nothing else.
    apiClient
      .listRanges()
      .then((response) => {
        if (!cancelled) setSiblings(response.ranges);
      })
      .catch(() => {
        if (!cancelled) setSiblings([]);
      });

    return () => {
      cancelled = true;
    };
  }, [rangeId]);

  const { previous, next } = useMemo(() => {
    const index = siblings.findIndex((entry) => entry.range_id === rangeId);
    if (index < 0) return { previous: null, next: null };
    return {
      previous: siblings[index - 1] ?? null,
      next: siblings[index + 1] ?? null,
    };
  }, [rangeId, siblings]);

  const go = (entry: RangeListItem | null) => {
    if (entry) navigate(`/charts/${encodeURIComponent(entry.range_id)}`);
  };

  useKeyboardShortcuts(
    useMemo(
      () => ({
        arrowleft: () => go(previous),
        arrowright: () => go(next),
      }),
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [previous, next]
    ),
    true
  );

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
            /*
              The size is appended only when there is one. `check` costs 0.0
              (RANGE-DATA-FORMAT §9), and "check 0bb" would appear in the legend
              and in all 169 cell descriptions — reading as a value that failed
              to load, in the one screen built to be trusted. The Provenance
              sizes row spells the zero out in words instead.
            */
            actionLabels={Object.fromEntries(
              range.actions.map((actionId) => {
                const size = range.action_sizes_bb[actionId];
                return [
                  actionId,
                  size ? `${actionId} ${formatBb(size)}` : actionId,
                ];
              })
            )}
          />
          <Provenance range={range} source={source} />
        </div>
      ) : null}

      <nav
        aria-label="Chart paging"
        className="flex flex-wrap items-center gap-3 text-sm"
      >
        <PageLink entry={previous} direction="previous" />
        <Link to="/charts" className="text-accent underline underline-offset-4">
          All charts
        </Link>
        <PageLink entry={next} direction="next" />
      </nav>
    </section>
  );
}

function PageLink({
  entry,
  direction,
}: {
  entry: RangeListItem | null;
  direction: 'previous' | 'next';
}) {
  const arrow = direction === 'previous' ? '←' : '→';
  const key = direction === 'previous' ? 'ArrowLeft' : 'ArrowRight';

  if (!entry) {
    return (
      <span aria-hidden="true" className="text-fg-muted opacity-40">
        {arrow}
      </span>
    );
  }

  return (
    <Link
      to={`/charts/${encodeURIComponent(entry.range_id)}`}
      rel={direction}
      aria-keyshortcuts={key}
      aria-label={`${direction === 'previous' ? 'Previous' : 'Next'} chart: ${entry.range_id}`}
      className="border-line text-fg hover:border-accent inline-flex min-h-9 items-center gap-2 rounded-md border px-3"
    >
      {direction === 'previous' ? arrow : null}
      <span className="font-mono text-xs">{entry.range_id}</span>
      {direction === 'next' ? arrow : null}
    </Link>
  );
}
