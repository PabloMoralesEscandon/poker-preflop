import { Link } from 'react-router-dom';

import type { SessionSummary } from '../api';
import { AccuracyBars } from './charts';

/**
 * Renders a session summary generically. `breakdown` is drill-defined, so this
 * only ever reads `key`, `label`, `answered`, `correct` and `accuracy` — it must
 * not assume the rows are positions.
 */
export function SummaryView({
  summary,
  onRestart,
}: {
  summary: SessionSummary;
  onRestart?: () => void;
}) {
  const percent = (value: number) => `${Math.round(value * 100)}%`;

  return (
    <section className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold tracking-tight">
          {summary.complete ? 'Session complete' : 'Session so far'}
        </h2>
        <p className="text-fg-muted text-sm">
          {summary.correct} of {summary.answered} correct
        </p>
      </div>

      <p
        aria-label={
          summary.answered === 0
            ? 'No hands answered yet'
            : `Session accuracy ${percent(summary.accuracy)}`
        }
        className="font-mono text-4xl font-semibold tabular-nums"
      >
        {summary.answered === 0 ? '—' : percent(summary.accuracy)}
      </p>

      {summary.breakdown.length > 0 ? (
        <AccuracyBars rows={summary.breakdown} caption="Breakdown" />
      ) : null}

      {summary.mistakes.length > 0 ? (
        <div className="space-y-2">
          <h3 className="text-fg text-sm font-medium">
            Missed ({summary.mistakes.length})
          </h3>
          <ul className="divide-line divide-y text-sm">
            {summary.mistakes.map((mistake) => (
              <li
                key={mistake.question_id}
                className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2"
              >
                <Link
                  to={`/charts/${encodeURIComponent(mistake.range_id)}?hand=${encodeURIComponent(mistake.hand)}`}
                  className="text-accent font-mono font-medium underline underline-offset-4"
                  title={`Show ${mistake.hand} in the ${mistake.range_id} chart`}
                >
                  {mistake.hand}
                </Link>
                <span className="text-fg-muted font-mono text-xs">
                  {mistake.position}
                </span>
                <span className="text-fg-muted text-xs">
                  played <span className="font-mono">{mistake.chosen}</span>,
                  chart says{' '}
                  <span className="text-fg font-mono">{mistake.expected}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-3">
        {onRestart ? (
          <button
            type="button"
            onClick={onRestart}
            className="bg-accent text-accent-fg rounded-md px-4 py-2 text-sm font-medium"
          >
            New session
          </button>
        ) : null}
        <Link
          to="/history"
          className="border-line text-fg rounded-md border px-4 py-2 text-sm font-medium"
        >
          History
        </Link>
      </div>
    </section>
  );
}
