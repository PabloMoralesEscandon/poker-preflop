import { Link } from 'react-router-dom';

import { ChevronLeftIcon, SpadeIcon } from '../components/icons';

export function NotFoundPage() {
  return (
    <section className="space-y-4 py-8">
      <SpadeIcon className="text-fg-muted text-4xl opacity-40" />
      <h1 className="font-display text-4xl leading-none tracking-[0.04em]">
        Not found
      </h1>
      <p className="text-fg-muted text-sm">That page does not exist.</p>
      <Link
        to="/"
        className="text-accent inline-flex items-center gap-1 text-sm underline underline-offset-4"
      >
        <ChevronLeftIcon className="text-sm" />
        Back to drills
      </Link>
    </section>
  );
}
