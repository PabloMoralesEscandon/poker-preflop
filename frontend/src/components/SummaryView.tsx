import { Link } from 'react-router-dom';

import type { SessionSummary } from '../api';
import { AccuracyBars } from './charts';
import { HistoryIcon, ReplayIcon, TargetIcon } from './icons';

/**
 * Renders a session summary generically. `breakdown` is drill-defined, so this
 * only ever reads `key`, `label`, `answered`, `correct` and `accuracy` — it must
 * not assume the rows are positions.
 *
 * The accuracy dial is the one moment in the app that is allowed to be a
 * scoreboard: the session is over, the number is the point, and a player who
 * has just answered twenty-five hands should be able to read the result from
 * across the desk. It is drawn with a conic sweep and printed in the middle, so
 * the arc is decoration over a number that is already there.
 */
export function SummaryView({
  summary,
  onRestart,
}: {
  summary: SessionSummary;
  onRestart?: () => void;
}) {
  const percent = (value: number) => `${Math.round(value * 100)}%`;
  const played = summary.answered > 0;

  // Bands, not a gradient: three states a player can name, using the same
  // validated slots the drill grades a single hand with.
  const tone = !played
    ? 'var(--fg-muted)'
    : summary.accuracy >= 0.85
      ? 'var(--good)'
      : summary.accuracy >= 0.65
        ? 'var(--warn)'
        : 'var(--bad)';

  return (
    <section className="space-y-6">
      <div className="space-y-1">
        <h2 className="font-display text-3xl leading-none tracking-[0.04em]">
          {summary.complete ? 'Session complete' : 'Session so far'}
        </h2>
        <p className="text-fg-muted text-sm">
          {summary.correct} of {summary.answered} correct
        </p>
      </div>

      <div
        className="border-line bg-surface flex flex-wrap items-center gap-5 rounded-2xl border p-5"
        style={{ boxShadow: 'var(--shadow-raised)' }}
      >
        <div
          aria-label={
            played
              ? `Session accuracy ${percent(summary.accuracy)}`
              : 'No hands answered yet'
          }
          className="relative grid size-28 shrink-0 place-items-center rounded-full"
          style={{
            background: `conic-gradient(${tone} ${
              played ? summary.accuracy * 360 : 0
            }deg, var(--surface-muted) 0deg)`,
          }}
        >
          <span className="bg-surface absolute inset-[7px] rounded-full" />
          <span className="font-display relative text-3xl leading-none tracking-wide">
            {played ? percent(summary.accuracy) : '—'}
          </span>
        </div>

        <dl className="grid grow grid-cols-2 gap-x-6 gap-y-3 sm:max-w-xs">
          <div>
            <dt className="text-fg-muted text-xs tracking-wide uppercase">
              Hands
            </dt>
            <dd className="font-mono text-xl font-semibold">
              {summary.answered}
            </dd>
          </div>
          <div>
            <dt className="text-fg-muted text-xs tracking-wide uppercase">
              Correct
            </dt>
            <dd className="font-mono text-xl font-semibold">
              {summary.correct}
            </dd>
          </div>
          <div>
            <dt className="text-fg-muted text-xs tracking-wide uppercase">
              Missed
            </dt>
            <dd className="font-mono text-xl font-semibold">
              {summary.mistakes.length}
            </dd>
          </div>
        </dl>
      </div>

      {summary.breakdown.length > 0 ? (
        <AccuracyBars rows={summary.breakdown} caption="Breakdown" />
      ) : null}

      {summary.mistakes.length > 0 ? (
        <div className="space-y-2">
          <h3 className="text-fg flex items-center gap-2 text-sm font-semibold">
            <TargetIcon className="text-base" style={{ color: 'var(--bad)' }} />
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
                  className="text-accent border-line hover:border-accent rounded border px-1.5 py-0.5 font-mono text-sm font-semibold"
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
            className="bg-accent text-accent-fg inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-transform hover:-translate-y-0.5"
            style={{ boxShadow: 'var(--shadow-raised)' }}
          >
            <ReplayIcon className="text-base" />
            New session
          </button>
        ) : null}
        <Link
          to="/history"
          className="border-line text-fg hover:border-fg-muted inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium"
        >
          <HistoryIcon className="text-base" />
          History
        </Link>
      </div>
    </section>
  );
}
