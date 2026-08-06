import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Not found</h1>
      <p className="text-fg-muted text-sm">That page does not exist.</p>
      <Link to="/" className="text-accent text-sm underline underline-offset-4">
        Back to drills
      </Link>
    </section>
  );
}
