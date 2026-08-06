import { Link, useParams } from 'react-router-dom';

import { DrillRunner } from '../drills/DrillRunner';
import '../drills/register';

export function DrillPage() {
  const { drillId } = useParams<{ drillId: string }>();

  if (!drillId) {
    return (
      <section className="space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">No drill</h1>
        <Link
          to="/"
          className="text-accent text-sm underline underline-offset-4"
        >
          Back to drills
        </Link>
      </section>
    );
  }

  return (
    <div className="space-y-6">
      <DrillRunner drillId={drillId} />
      <Link
        to="/"
        className="text-accent inline-block text-sm underline underline-offset-4"
      >
        Back to drills
      </Link>
    </div>
  );
}
