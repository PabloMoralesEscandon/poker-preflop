import type { ReactNode } from 'react';
import { Link, NavLink } from 'react-router-dom';

import { GridIcon, HistoryIcon, LogoMark } from './icons';
import { cn } from '../lib/cn';

/**
 * The frame every page sits in.
 *
 * The wordmark is set in the display face and paired with the chip mark, so the
 * app has an identity in the tab strip and at the top of a screenshot. The nav
 * marks the current section rather than leaving every link looking equally
 * unvisited — with three destinations, "where am I" should not require reading
 * the URL.
 */

const NAV = [
  { to: '/charts', label: 'Charts', Icon: GridIcon },
  { to: '/history', label: 'History', Icon: HistoryIcon },
];

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-full flex-col">
      <a
        href="#main"
        className="bg-accent text-accent-fg sr-only rounded-md px-3 py-2 text-sm focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50"
      >
        Skip to content
      </a>

      <header className="border-line bg-surface/85 sticky top-0 z-10 border-b backdrop-blur">
        <div className="mx-auto flex w-full max-w-5xl items-center gap-3 px-4 py-2.5 sm:px-6">
          <Link
            to="/"
            className="group flex items-baseline gap-2 tracking-tight"
          >
            <LogoMark className="translate-y-[3px] text-2xl" />
            <span className="font-display text-fg text-2xl leading-none tracking-[0.06em]">
              Poker Learner
            </span>
          </Link>
          <span className="text-fg-muted hidden text-xs sm:inline">
            preflop and postflop drills
          </span>

          <nav aria-label="Main" className="ml-auto flex gap-1">
            {NAV.map(({ to, label, Icon }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm transition-colors',
                    isActive
                      ? 'bg-surface-muted text-fg font-medium'
                      : 'text-fg-muted hover:text-fg hover:bg-surface-muted/60'
                  )
                }
              >
                <Icon className="text-base" />
                {label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>

      <main
        id="main"
        className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6 sm:py-8"
      >
        {children}
      </main>

      <footer className="border-line text-fg-muted mt-auto border-t px-4 py-4 text-xs sm:px-6">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-x-2">
          <LogoMark className="text-sm" />
          Free and self-hosted. No accounts, no paid data.
        </div>
      </footer>
    </div>
  );
}
