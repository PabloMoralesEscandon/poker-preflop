import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { apiClient, type DrillInfo } from '../api';
import { ErrorState, LoadingState } from '../components/states';

export function HomePage() {
  const [drills, setDrills] = useState<DrillInfo[] | null>(null);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(() => {
    setError(null);
    setDrills(null);
    let cancelled = false;
    apiClient
      .listDrills()
      .then((response) => {
        if (!cancelled) setDrills(response.drills);
      })
      .catch((caught: unknown) => {
        if (!cancelled) setError(caught);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => load(), [load]);

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Drills</h1>
      <p className="text-fg-muted max-w-prose text-sm">
        Pick a drill to start a session. The list comes from the server, so a
        new drill appears here with no frontend change.
      </p>

      {error ? <ErrorState error={error} onRetry={load} /> : null}
      {!drills && !error ? <LoadingState label="Loading drills…" /> : null}

      {drills ? (
        <ul className="grid gap-3 sm:grid-cols-2">
          {drills.map((drill) => (
            <li key={drill.id}>
              <Link
                to={`/drill/${drill.id}`}
                className="border-line bg-surface hover:border-accent block h-full rounded-lg border p-4 transition-colors"
              >
                <span className="text-fg block text-sm font-semibold">
                  {drill.name}
                </span>
                <span className="text-fg-muted mt-1 block text-sm">
                  {drill.description}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
