import type { SessionSummary } from '../api';

/**
 * Renders a session summary generically. `breakdown` is drill-defined, so this
 * only ever reads `key`, `label` and `accuracy` — it must not assume the rows
 * are positions.
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

      <p className="font-mono text-4xl font-semibold tabular-nums">
        {summary.answered === 0 ? '—' : percent(summary.accuracy)}
      </p>

      {summary.breakdown.length > 0 ? (
        <div className="space-y-2">
          <h3 className="text-fg text-sm font-medium">Breakdown</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-fg-muted text-left text-xs">
                <th scope="col" className="py-1 font-medium">
                  Group
                </th>
                <th scope="col" className="py-1 text-right font-medium">
                  Correct
                </th>
                <th scope="col" className="py-1 text-right font-medium">
                  Accuracy
                </th>
              </tr>
            </thead>
            <tbody>
              {summary.breakdown.map((row) => (
                <tr key={row.key} className="border-line border-t">
                  <th scope="row" className="py-1.5 text-left font-normal">
                    {row.label}
                  </th>
                  <td className="py-1.5 text-right font-mono tabular-nums">
                    {row.correct}/{row.answered}
                  </td>
                  <td className="py-1.5 text-right font-mono tabular-nums">
                    {percent(row.accuracy)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
                className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-1.5"
              >
                <span className="font-mono font-medium">{mistake.hand}</span>
                <span className="text-fg-muted font-mono text-xs">
                  {mistake.position}
                </span>
                <span className="text-fg-muted text-xs">
                  played <span className="font-mono">{mistake.chosen}</span>,
                  chart says{' '}
                  <span className="font-mono">{mistake.expected}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {onRestart ? (
        <button
          type="button"
          onClick={onRestart}
          className="bg-accent text-accent-fg rounded-md px-4 py-2 text-sm font-medium"
        >
          New session
        </button>
      ) : null}
    </section>
  );
}
