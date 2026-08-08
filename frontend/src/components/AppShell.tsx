import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-full flex-col">
      <a
        href="#main"
        className="bg-accent text-accent-fg sr-only rounded-md px-3 py-2 text-sm focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50"
      >
        Skip to content
      </a>

      <header className="border-line bg-surface/80 sticky top-0 z-10 border-b backdrop-blur">
        <div className="mx-auto flex w-full max-w-5xl items-baseline gap-3 px-4 py-3 sm:px-6">
          <Link
            to="/"
            className="text-fg text-base font-semibold tracking-tight"
          >
            Poker Learner
          </Link>
          <span className="text-fg-muted hidden text-sm sm:inline">
            preflop and postflop drills
          </span>
          <nav aria-label="Main" className="ml-auto flex gap-4">
            <Link to="/charts" className="text-fg-muted hover:text-fg text-sm">
              Charts
            </Link>
            <Link to="/history" className="text-fg-muted hover:text-fg text-sm">
              History
            </Link>
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
        <div className="mx-auto w-full max-w-5xl">
          Free and self-hosted. No accounts, no paid data.
        </div>
      </footer>
    </div>
  );
}
