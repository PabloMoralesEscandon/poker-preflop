import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { AccuracyBars, AccuracyTrend } from '../components/charts';
import { aggregate, MIN_SAMPLE, type StoredSession } from '../lib/history';
import { clearHistory, loadHistory } from '../lib/historyStorage';

/**
 * Progress across sessions, entirely client-side. Nothing here is sent
 * anywhere; it is a rollup of what is already in `localStorage`.
 */
export function HistoryPage() {
  const [sessions, setSessions] = useState<StoredSession[]>(() =>
    loadHistory()
  );

  const summary = useMemo(() => aggregate(sessions), [sessions]);
  const percent = (value: number) => `${Math.round(value * 100)}%`;

  if (sessions.length === 0) {
    return (
      <section className="space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">History</h1>
        <p className="text-fg-muted max-w-prose text-sm">
          Nothing here yet. Finish a session and it will be recorded in this
          browser — never sent anywhere.
        </p>
        <Link
          to="/"
          className="text-accent inline-block text-sm underline underline-offset-4"
        >
          Back to drills
        </Link>
      </section>
    );
  }

  const weakest = summary.weakest[0];

  return (
    <section className="space-y-8">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">History</h1>
        <p className="text-fg-muted text-sm">
          {summary.sessions} session{summary.sessions === 1 ? '' : 's'} ·{' '}
          {summary.correct} of {summary.answered} correct
        </p>
      </div>

      <div className="flex flex-wrap items-baseline gap-x-8 gap-y-2">
        <p
          aria-label={`Overall accuracy ${percent(summary.accuracy)}`}
          className="font-mono text-4xl font-semibold tabular-nums"
        >
          {percent(summary.accuracy)}
        </p>
        {weakest ? (
          // Naming the threshold matters: the chart below can show a worse row
          // that has too few hands to mean anything, and without this the
          // headline looks like it is contradicting the chart.
          <p className="text-fg-muted max-w-prose text-sm">
            Weakest group with at least {MIN_SAMPLE} hands:{' '}
            <span className="text-fg font-medium">{weakest.label}</span> at{' '}
            {percent(weakest.accuracy)} over {weakest.answered} hands.
          </p>
        ) : (
          <p className="text-fg-muted max-w-prose text-sm">
            No group has {MIN_SAMPLE} hands yet — keep drilling and a weakest
            spot will show up here.
          </p>
        )}
      </div>

      <AccuracyTrend points={summary.trend} className="max-w-xl" />

      <AccuracyBars
        rows={summary.byKey}
        caption="Accuracy by group, across every session"
        className="max-w-xl"
      />

      <div className="space-y-2">
        <h2 className="text-fg text-sm font-medium">Sessions</h2>
        <ul className="divide-line divide-y text-sm">
          {sessions.map((session, index) => (
            <li
              key={`${session.completed_at}-${index}`}
              className="flex flex-wrap items-baseline gap-x-4 gap-y-1 py-2"
            >
              <span className="font-mono tabular-nums">
                {session.answered === 0
                  ? '—'
                  : percent(session.correct / session.answered)}
              </span>
              <span className="text-fg-muted text-xs">
                {session.correct}/{session.answered}
              </span>
              <span className="text-fg-muted font-mono text-xs">
                {session.drill_id}
              </span>
              <span className="text-fg-muted text-xs">
                {new Date(session.completed_at).toLocaleString()}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex flex-wrap gap-3">
        <Link
          to="/"
          className="border-line text-fg rounded-md border px-4 py-2 text-sm font-medium"
        >
          Back to drills
        </Link>
        <button
          type="button"
          onClick={() => {
            clearHistory();
            setSessions([]);
          }}
          className="border-line text-fg-muted rounded-md border px-4 py-2 text-sm"
        >
          Clear history
        </button>
      </div>
    </section>
  );
}
