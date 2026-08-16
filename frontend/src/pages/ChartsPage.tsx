import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import { apiClient, type RangeListItem, type SourceInfo } from '../api';
import { ErrorState, LoadingState } from '../components/states';

/**
 * The chart index: every stored range, grouped by spot then table format.
 *
 * Filters live in the query string so a filtered view is a link someone can
 * send, which is the same reason each chart has its own URL.
 */

const SPOT_LABELS: Record<string, string> = {
  rfi: 'Raise first in',
  vs_rfi: 'Facing a raise',
  vs_limp: 'Facing a limp',
};

const spotLabel = (spot: string) => SPOT_LABELS[spot] ?? spot;

function titleOf(entry: RangeListItem): string {
  return entry.vs_position
    ? `${entry.position} vs ${entry.vs_position}`
    : entry.position;
}

export function ChartsPage() {
  const [params, setParams] = useSearchParams();
  const [ranges, setRanges] = useState<RangeListItem[] | null>(null);
  const [sources, setSources] = useState<SourceInfo[]>([]);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(() => {
    setError(null);
    setRanges(null);
    let cancelled = false;
    // The range list is required; the source register is supporting detail. A
    // server that cannot serve provenance yet should still list its charts —
    // they are then shown as having an unknown source, which is the truth.
    Promise.all([
      apiClient.listRanges(),
      apiClient.getSources().catch(() => ({ sources: [] as SourceInfo[] })),
    ])
      .then(([rangeResponse, sourceResponse]) => {
        if (cancelled) return;
        setRanges(rangeResponse.ranges);
        setSources(sourceResponse.sources);
      })
      .catch((caught: unknown) => {
        if (!cancelled) setError(caught);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => load(), [load]);

  const spot = params.get('spot') ?? '';
  const format = params.get('table_format') ?? '';
  const position = params.get('position') ?? '';

  const setFilter = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  const sourceById = useMemo(
    () => new Map(sources.map((source) => [source.source_id, source])),
    [sources]
  );

  const options = useMemo(() => {
    const all = ranges ?? [];
    return {
      spots: [...new Set(all.map((entry) => entry.spot))].sort(),
      formats: [...new Set(all.map((entry) => entry.table_format))].sort(),
      positions: [...new Set(all.map((entry) => entry.position))],
    };
  }, [ranges]);

  const visible = useMemo(
    () =>
      (ranges ?? []).filter(
        (entry) =>
          (!spot || entry.spot === spot) &&
          (!format || entry.table_format === format) &&
          (!position || entry.position === position)
      ),
    [format, position, ranges, spot]
  );

  /** Grouped by spot, then table format, in that order. */
  const groups = useMemo(() => {
    const map = new Map<string, Map<string, RangeListItem[]>>();
    for (const entry of visible) {
      const byFormat = map.get(entry.spot) ?? new Map();
      byFormat.set(entry.table_format, [
        ...(byFormat.get(entry.table_format) ?? []),
        entry,
      ]);
      map.set(entry.spot, byFormat);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [visible]);

  return (
    <section className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Charts</h1>
        <p className="text-fg-muted max-w-prose text-sm">
          Every range the server holds, with where it came from. Open one to
          compare our totals against the published chart.
        </p>
      </div>

      {error ? <ErrorState error={error} onRetry={load} /> : null}
      {!ranges && !error ? <LoadingState label="Loading charts…" /> : null}

      {ranges ? (
        <>
          <div className="flex flex-wrap gap-4">
            <Filter
              label="Spot"
              value={spot}
              options={options.spots.map((value) => ({
                value,
                label: spotLabel(value),
              }))}
              onChange={(value) => setFilter('spot', value)}
            />
            <Filter
              label="Table format"
              value={format}
              options={options.formats.map((value) => ({
                value,
                label: value,
              }))}
              onChange={(value) => setFilter('table_format', value)}
            />
            <Filter
              label="Position"
              value={position}
              options={options.positions.map((value) => ({
                value,
                label: value,
              }))}
              onChange={(value) => setFilter('position', value)}
            />
          </div>

          <p className="text-fg-muted text-sm" role="status">
            {visible.length} of {ranges.length} charts
          </p>

          {groups.map(([spotKey, byFormat]) => (
            <section key={spotKey} className="space-y-4">
              <h2 className="text-fg text-lg font-semibold">
                {spotLabel(spotKey)}
              </h2>

              {[...byFormat.entries()]
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([formatKey, entries]) => (
                  <div key={formatKey} className="space-y-2">
                    <h3 className="text-fg-muted font-mono text-xs">
                      {formatKey}
                    </h3>
                    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {entries.map((entry) => (
                        <li key={entry.range_id}>
                          <ChartCard
                            entry={entry}
                            source={sourceById.get(entry.source_id) ?? null}
                          />
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
            </section>
          ))}

          {visible.length === 0 ? (
            <p className="border-line text-fg-muted rounded-lg border border-dashed p-6 text-sm">
              No chart matches those filters.
            </p>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

function ChartCard({
  entry,
  source,
}: {
  entry: RangeListItem;
  source: SourceInfo | null;
}) {
  const unverified = !source || source.role === 'fixture';

  return (
    <Link
      to={`/charts/${encodeURIComponent(entry.range_id)}`}
      className="border-line bg-surface hover:border-accent block h-full space-y-1 rounded-lg border px-3 py-2 transition-colors"
    >
      <span className="flex flex-wrap items-baseline gap-x-2">
        <span className="text-fg text-sm font-semibold">{titleOf(entry)}</span>
        <span className="text-fg-muted text-xs">
          {Math.round(entry.stats.vpip * 1000) / 10}% · {entry.stats.combos}{' '}
          combos
        </span>
      </span>

      <span className="text-fg-muted block font-mono text-xs">
        {entry.range_id}
      </span>

      {/* The audit signal: anything not traceable to a published chart says so
          on the card, before it is opened. */}
      <span className="flex flex-wrap items-center gap-x-2 text-xs">
        {unverified ? (
          <span
            data-role={source?.role ?? 'unknown'}
            className="rounded-full border border-[var(--viz-series-4)] px-1.5 text-[0.625rem] text-[var(--viz-series-4)]"
          >
            unverified
          </span>
        ) : null}
        <span className="text-fg-muted">
          {source ? source.name : `Unknown source ${entry.source_id}`}
        </span>
      </span>
    </Link>
  );
}

function Filter({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs">
      <span className="text-fg-muted">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="border-line bg-surface text-fg min-h-9 rounded-md border px-2 py-1 text-sm"
      >
        <option value="">All</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
