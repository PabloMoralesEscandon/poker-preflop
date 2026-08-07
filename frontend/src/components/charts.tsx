import { cn } from '../lib/cn';

/**
 * The two charts the summary and history screens need.
 *
 * Both show one measure — accuracy — so both use a single hue rather than a
 * categorical palette, carry no legend (the heading names the measure), and
 * print the value directly on each mark. Nothing is encoded by colour alone.
 *
 * Neither knows what a "key" is: the label is an opaque string supplied by the
 * drill, so these keep working for drill #2 unchanged.
 */

export interface AccuracyRow {
  key: string;
  label: string;
  answered: number;
  correct: number;
  accuracy: number;
}

const percent = (value: number) => `${Math.round(value * 100)}%`;

/**
 * Horizontal bars, one per key. A real table underneath the visual: the numbers
 * are in the markup, so a screen reader gets the data and the bar is decoration.
 */
export function AccuracyBars({
  rows,
  caption,
  className,
}: {
  rows: readonly AccuracyRow[];
  caption: string;
  className?: string;
}) {
  if (rows.length === 0) return null;

  return (
    <table className={cn('w-full text-sm', className)}>
      <caption className="text-fg mb-2 text-left text-sm font-medium">
        {caption}
      </caption>
      <thead className="sr-only">
        <tr>
          <th scope="col">Group</th>
          <th scope="col">Accuracy</th>
          <th scope="col">Correct</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const untouched = row.answered === 0;
          return (
            <tr key={row.key} data-answered={row.answered}>
              <th
                scope="row"
                className={cn(
                  'w-28 py-1 pr-3 text-left font-normal',
                  untouched && 'text-fg-muted'
                )}
              >
                {row.label}
              </th>

              <td className="py-1">
                <div
                  aria-hidden="true"
                  className="bg-surface-muted h-2 w-full overflow-hidden rounded-full"
                >
                  {untouched ? null : (
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.max(row.accuracy * 100, 1.5).toFixed(1)}%`,
                        background: 'var(--viz-series-1)',
                      }}
                    />
                  )}
                </div>
              </td>

              <td
                className={cn(
                  'w-24 py-1 pl-3 text-right font-mono text-xs tabular-nums',
                  untouched && 'text-fg-muted'
                )}
              >
                {untouched
                  ? '—'
                  : `${percent(row.accuracy)} · ${row.correct}/${row.answered}`}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/**
 * Accuracy per session, oldest → newest. Columns rather than a line: the points
 * are discrete sessions, not a continuous series, and a line between them would
 * imply values in between that do not exist.
 */
export function AccuracyTrend({
  points,
  className,
}: {
  points: readonly { completed_at: string; accuracy: number }[];
  className?: string;
}) {
  if (points.length === 0) return null;

  return (
    <figure className={cn('space-y-2', className)}>
      <figcaption className="text-fg text-sm font-medium">
        Accuracy per session
      </figcaption>

      <div
        role="img"
        aria-label={`Accuracy across the last ${points.length} sessions, oldest first: ${points
          .map((point) => percent(point.accuracy))
          .join(', ')}`}
        className="border-line flex h-24 items-end justify-start gap-1 border-b pb-0"
      >
        {points.map((point, index) => (
          <div
            key={`${point.completed_at}-${index}`}
            title={`${new Date(point.completed_at).toLocaleDateString()} — ${percent(point.accuracy)}`}
            data-accuracy={point.accuracy.toFixed(4)}
            className="max-w-10 min-w-1 flex-1 rounded-t-[2px]"
            style={{
              height: `${Math.max(point.accuracy * 100, 1.5).toFixed(1)}%`,
              background: 'var(--viz-series-1)',
            }}
          />
        ))}
      </div>

      <div className="text-fg-muted flex justify-between font-mono text-xs">
        <span>oldest</span>
        <span>{percent(points[points.length - 1]?.accuracy ?? 0)} latest</span>
      </div>
    </figure>
  );
}
