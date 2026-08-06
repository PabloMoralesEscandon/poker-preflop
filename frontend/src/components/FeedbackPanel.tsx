import { useEffect, useState } from 'react';

import type { AnswerResponse, ApiClient, Question, RangeDetail } from '../api';
import { getDrillEntry } from '../drills/registry';
import { cn } from '../lib/cn';
import { isMissInMixedSpot, verdictOf, type Verdict } from '../lib/verdict';
import { useAutoFocus } from '../lib/useAutoFocus';
import { HandGrid } from './HandGrid';

/**
 * Shared feedback for one answered question.
 *
 * Everything here is contract-level and drill-agnostic: the verdict, the
 * expected action, the explanation, and the chart for `explanation.range_id`.
 * Only *which cell to highlight* is drill-specific, and that comes from the
 * registry rather than from a branch on the drill id.
 */

const VERDICT_COPY: Record<Verdict, { title: string; tone: string }> = {
  // A mixed spot is neither a win nor a loss, and must not read as either.
  correct: { title: 'Correct', tone: 'var(--viz-series-3)' },
  mixed: {
    title: 'Acceptable — this is a mixed spot',
    tone: 'var(--viz-series-1)',
  },
  incorrect: { title: 'Not the chart action', tone: 'var(--viz-series-2)' },
};

export interface FeedbackPanelProps {
  client: ApiClient;
  answer: AnswerResponse;
  question: Question;
  busy?: boolean;
  onNext: () => void;
}

export function FeedbackPanel({
  client,
  answer,
  question,
  busy = false,
  onNext,
}: FeedbackPanelProps) {
  const verdict = verdictOf(answer);
  const copy = VERDICT_COPY[verdict];
  const missedInMixedSpot = isMissInMixedSpot(answer);
  const nextRef = useAutoFocus<HTMLButtonElement>(true);

  const rangeId = answer.explanation.range_id;
  const [range, setRange] = useState<RangeDetail | null>(null);

  useEffect(() => {
    let cancelled = false;
    setRange(null);
    if (!rangeId) return;
    client
      .getRange(rangeId)
      .then((detail) => {
        if (!cancelled) setRange(detail);
      })
      .catch(() => {
        // The chart is supporting detail. If the range is missing, the verdict
        // and explanation still stand on their own.
        if (!cancelled) setRange(null);
      });
    return () => {
      cancelled = true;
    };
  }, [client, rangeId]);

  const highlight =
    getDrillEntry(question.prompt.kind)?.gridHighlight?.(question.prompt) ??
    null;

  return (
    <section
      aria-live="polite"
      // Enter or Escape anywhere in the panel moves on, so the feedback is
      // dismissible without reaching for the mouse.
      onKeyDown={(event) => {
        if (event.key === 'Escape' || (event.key === 'Enter' && !busy)) {
          event.preventDefault();
          onNext();
        }
      }}
      className="space-y-5"
    >
      <div
        data-verdict={verdict}
        className="border-line bg-surface space-y-2 rounded-lg border-l-4 border p-4"
        style={{ borderLeftColor: copy.tone }}
      >
        <p className="text-fg text-base font-semibold">{copy.title}</p>

        {missedInMixedSpot ? (
          // The chart splits this hand, but not down the line that was taken.
          // Without this the user reads "wrong" and concludes the spot has a
          // single right answer.
          <p className="text-fg-muted text-sm">
            This hand is a mixed spot, but{' '}
            <span className="text-fg font-medium">{answer.chosen.label}</span>{' '}
            is not one of the lines the chart takes.
          </p>
        ) : null}

        <p className="text-fg-muted text-sm">
          You played{' '}
          <span className="text-fg font-medium">{answer.chosen.label}</span>.
          The chart plays{' '}
          <span className="text-fg font-medium">{answer.expected.label}</span>
          {answer.expected.frequency < 1
            ? ` ${Math.round(answer.expected.frequency * 100)}% of the time`
            : ''}
          .
        </p>

        <p className="text-fg text-sm">{answer.explanation.summary}</p>
        <p className="text-fg-muted text-sm">{answer.explanation.detail}</p>
      </div>

      {range ? (
        <HandGrid
          grid={range.grid}
          stats={range.stats}
          label={rangeId}
          highlightedHand={highlight}
          actionLabels={Object.fromEntries(
            range.actions.map((actionId) => [actionId, actionId])
          )}
          className="max-w-xl"
        />
      ) : null}

      <button
        ref={nextRef}
        type="button"
        onClick={onNext}
        disabled={busy}
        className={cn(
          'bg-accent text-accent-fg rounded-md px-4 py-2 text-sm font-medium',
          busy && 'opacity-50'
        )}
      >
        Next hand
      </button>
    </section>
  );
}
