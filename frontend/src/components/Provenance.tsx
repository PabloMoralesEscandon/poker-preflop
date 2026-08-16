import type { RangeDetail, SourceInfo } from '../api';
import { formatBb, formatChips } from '../lib/bb';
import { cn } from '../lib/cn';

/**
 * Where a chart came from and what it claims, laid out for someone holding the
 * published PDF next to the screen.
 *
 * The job is audit, so two rules follow. Nothing is paraphrased — the file's
 * own `notes` are shown verbatim. And nothing needs arithmetic — every combo
 * count is printed next to its percentage, because the number a reader is
 * comparing against is the one the chart prints, and making them divide by 1326
 * in their head is how mistakes get missed.
 */

/** Total starting-hand combinations. */
const TOTAL_COMBOS = 1326;

const ROLE_COPY: Record<SourceInfo['role'], { label: string; tone: string }> = {
  primary: { label: 'Primary source', tone: 'var(--viz-series-3)' },
  'cross-check': { label: 'Cross-check', tone: 'var(--viz-series-1)' },
  'not-usable': { label: 'Not usable', tone: 'var(--viz-series-2)' },
  fixture: { label: 'Illustrative fixture', tone: 'var(--viz-series-4)' },
};

const percent = (value: number, places = 1) =>
  `${(value * 100).toFixed(places)}%`;

export function Provenance({
  range,
  source,
  className,
}: {
  range: RangeDetail;
  source: SourceInfo | null;
  className?: string;
}) {
  const role = source ? ROLE_COPY[source.role] : null;
  const played = range.stats.combos;

  return (
    <section
      aria-label="Provenance"
      className={cn(
        'border-line bg-surface space-y-5 rounded-lg border p-4',
        className
      )}
    >
      <div className="space-y-2">
        <h2 className="text-fg text-sm font-semibold">Source</h2>

        {source ? (
          <>
            <p className="flex flex-wrap items-center gap-2 text-sm">
              <span
                data-role={source.role}
                className="rounded-full border px-2 py-0.5 text-xs font-medium"
                style={{ borderColor: role?.tone, color: role?.tone }}
              >
                {role?.label}
              </span>
              <span className="text-fg font-medium">{source.name}</span>
            </p>

            {source.url ? (
              <p className="text-sm break-all">
                <a
                  href={source.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-accent underline underline-offset-4"
                >
                  {source.url}
                </a>
              </p>
            ) : (
              <p className="text-fg-muted text-sm">
                No URL — this data is not published anywhere.
              </p>
            )}

            <dl className="text-fg-muted grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
              <dt>Verified on</dt>
              <dd className="text-fg font-mono">
                {source.verified_on ?? 'never'}
              </dd>
              <dt>Source id</dt>
              <dd className="text-fg font-mono">{source.source_id}</dd>
            </dl>

            {source.notes ? (
              <p className="text-fg-muted max-w-prose text-xs">
                {source.notes}
              </p>
            ) : null}
          </>
        ) : (
          <p role="alert" className="text-sm text-[var(--viz-series-2)]">
            No source is registered for{' '}
            <span className="font-mono">{range.source_id}</span>. Treat this
            chart as unverified.
          </p>
        )}
      </div>

      <div className="space-y-2">
        <h2 className="text-fg text-sm font-semibold">This chart</h2>
        <dl className="text-fg-muted grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
          <dt>Range id</dt>
          <dd className="text-fg font-mono">{range.range_id}</dd>
          <dt>Stack depth</dt>
          <dd className="text-fg font-mono">{formatBb(range.stack_bb)}</dd>
          {range.facing_size_bb !== null ? (
            <>
              <dt>Facing</dt>
              <dd className="text-fg font-mono">
                {formatBb(range.facing_size_bb)}
              </dd>
            </>
          ) : null}
          <dt>Sizes</dt>
          <dd className="text-fg font-mono">
            {/*
              `check` is a real action whose size is 0.0 (RANGE-DATA-FORMAT §9).
              Rendering that as "0bb" would read as a value that failed to load,
              in the one panel whose whole job is that numbers can be trusted.
            */}
            {Object.entries(range.action_sizes_bb).length === 0
              ? '—'
              : Object.entries(range.action_sizes_bb)
                  .map(([actionId, size]) => `${actionId} ${formatChips(size)}`)
                  .join(' · ')}
          </dd>
        </dl>

        {/* The file's own words, unedited. */}
        <p className="text-fg-muted max-w-prose text-xs whitespace-pre-line">
          {range.notes}
        </p>
      </div>

      <div className="space-y-2">
        <h2 className="text-fg text-sm font-semibold">
          Totals to check against the chart
        </h2>

        <table className="w-full text-xs">
          <thead>
            <tr className="text-fg-muted text-left">
              <th scope="col" className="py-1 font-medium">
                Action
              </th>
              <th scope="col" className="py-1 text-right font-medium">
                Combos
              </th>
              <th scope="col" className="py-1 text-right font-medium">
                of 1326
              </th>
              <th scope="col" className="py-1 text-right font-medium">
                of played
              </th>
            </tr>
          </thead>
          <tbody className="font-mono">
            {range.actions.map((actionId) => {
              const combos = range.stats.by_action[actionId];
              return (
                <tr
                  key={actionId}
                  data-action={actionId}
                  className="border-line border-t"
                >
                  <th
                    scope="row"
                    className="text-fg py-1 text-left font-normal"
                  >
                    {actionId}
                  </th>
                  <td className="py-1 text-right tabular-nums">
                    {combos === undefined ? '—' : combos}
                  </td>
                  <td className="py-1 text-right tabular-nums">
                    {combos === undefined
                      ? '—'
                      : percent(combos / TOTAL_COMBOS)}
                  </td>
                  <td className="py-1 text-right tabular-nums">
                    {combos === undefined || played === 0
                      ? '—'
                      : percent(combos / played)}
                  </td>
                </tr>
              );
            })}

            <tr className="border-line text-fg border-t-2 font-medium">
              <th scope="row" className="py-1 text-left">
                played
              </th>
              <td className="py-1 text-right tabular-nums">{played}</td>
              <td className="py-1 text-right tabular-nums">
                {percent(range.stats.vpip)}
              </td>
              <td className="py-1 text-right tabular-nums">100.0%</td>
            </tr>
            {/*
              The fold row stays even when it is zero. A `vs_limp` chart folds
              0.0% of 1326 combos and prints exactly that line under the grid
              (BVB-CALIBRATION §3) — so a reader checking our totals against the
              PDF has a row to check it against. Hiding it would remove the one
              number that proves nothing folds.
            */}
            <tr className="border-line text-fg-muted border-t">
              <th scope="row" className="py-1 text-left font-normal">
                fold
              </th>
              <td className="py-1 text-right tabular-nums">
                {Math.round((TOTAL_COMBOS - played) * 100) / 100}
              </td>
              <td className="py-1 text-right tabular-nums">
                {percent((TOTAL_COMBOS - played) / TOTAL_COMBOS)}
              </td>
              <td className="py-1 text-right tabular-nums">—</td>
            </tr>
          </tbody>
        </table>

        <p className="text-fg-muted text-xs">
          {range.stats.hands_played} of 169 hands are played at least some of
          the time.
          {Object.keys(range.stats.by_action).length === 0
            ? ' Per-action combos are missing from this payload.'
            : ''}
        </p>
      </div>
    </section>
  );
}
