import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { apiClient, type DrillInfo } from '../api';
import { ErrorState, LoadingState } from '../components/states';
import {
  ArrowRightIcon,
  ClubIcon,
  DiamondIcon,
  HeartIcon,
  SpadeIcon,
} from '../components/icons';

/**
 * The picker.
 *
 * The list comes from `GET /drills`, so a new drill appears here with no
 * frontend change — including its suit. The four suits are handed out by
 * position in the list rather than mapped to drill ids, which is the same
 * reason nothing else on this page names a drill: a fourth drill should get a
 * club without anyone editing this file.
 */

const SUITS = [
  { Suit: SpadeIcon, ink: 'var(--card-ink)' },
  { Suit: HeartIcon, ink: 'var(--card-ink-red)' },
  { Suit: DiamondIcon, ink: 'var(--card-ink-red)' },
  { Suit: ClubIcon, ink: 'var(--card-ink)' },
];

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
    <section className="space-y-5">
      <div className="space-y-1">
        <h1 className="font-display text-4xl leading-none tracking-[0.04em]">
          Drills
        </h1>
        <p className="text-fg-muted max-w-prose text-sm">
          Pick a drill to start a session. The list comes from the server, so a
          new drill appears here with no frontend change.
        </p>
      </div>

      {error ? <ErrorState error={error} onRetry={load} /> : null}
      {!drills && !error ? <LoadingState label="Loading drills…" /> : null}

      {drills ? (
        <ul className="grid gap-3 sm:grid-cols-2">
          {drills.map((drill, index) => {
            const { Suit, ink } = SUITS[index % SUITS.length]!;
            return (
              <li key={drill.id}>
                <Link
                  to={`/drill/${drill.id}`}
                  className="group border-line bg-surface hover:border-accent flex h-full items-start gap-3 rounded-xl border p-4 transition-[transform,border-color] hover:-translate-y-0.5"
                  style={{ boxShadow: 'var(--shadow-raised)' }}
                >
                  {/* A card corner, stood up next to the title. It gives each
                      drill something to be recognised by at a glance; the name
                      beside it is what actually says which one it is. */}
                  <span
                    aria-hidden="true"
                    className="grid size-10 shrink-0 place-items-center rounded-lg text-xl transition-transform group-hover:-rotate-6"
                    style={{
                      background:
                        'linear-gradient(155deg, #ffffff, var(--card-face) 55%, #f0ece3)',
                      color: ink,
                      boxShadow:
                        '0 0 0 1px oklch(0% 0 0 / 0.15), 0 2px 6px -2px oklch(0% 0 0 / 0.35)',
                    }}
                  >
                    <Suit />
                  </span>

                  <span className="flex flex-col gap-1">
                    <span className="text-fg flex items-center gap-2 text-base font-semibold tracking-tight">
                      {drill.name}
                      <ArrowRightIcon className="text-fg-muted text-sm transition-transform group-hover:translate-x-1" />
                    </span>
                    <span className="text-fg-muted text-sm">
                      {drill.description}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
