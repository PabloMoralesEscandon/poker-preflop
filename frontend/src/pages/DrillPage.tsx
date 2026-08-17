import { Link, useParams } from 'react-router-dom';

import { ChevronLeftIcon } from '../components/icons';
import { DrillRunner } from '../drills/DrillRunner';
import '../drills/register';

export function DrillPage() {
  const { drillId } = useParams<{ drillId: string }>();

  if (!drillId) {
    return (
      <section className="space-y-4">
        <h1 className="font-display text-4xl leading-none tracking-[0.04em]">
          No drill
        </h1>
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

  return (
    <div className="space-y-6">
      <DrillRunner drillId={drillId} />
      <Link
        to="/"
        className="text-accent inline-flex items-center gap-1 text-sm underline underline-offset-4"
      >
        <ChevronLeftIcon className="text-sm" />
        Back to drills
      </Link>
    </div>
  );
}
