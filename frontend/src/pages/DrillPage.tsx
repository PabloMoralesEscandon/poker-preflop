import { Link, useParams } from 'react-router-dom';

export function DrillPage() {
  const { drillId } = useParams<{ drillId: string }>();

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">
        <span className="font-mono">{drillId}</span>
      </h1>
      <p className="text-fg-muted max-w-prose text-sm">
        The session runner lives here. It is shared by every drill: config,
        question, answer, feedback, summary.
      </p>
      <Link to="/" className="text-accent text-sm underline underline-offset-4">
        Back to drills
      </Link>
    </section>
  );
}
