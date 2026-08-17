import { useEffect, useState, type ComponentType } from 'react';

import type { AnswerResponse, ApiClient, Question, RangeDetail } from '../api';
import { getDrillEntry } from '../drills/registry';
import { cn } from '../lib/cn';
import { isMissInMixedSpot, verdictOf, type Verdict } from '../lib/verdict';
import { useAutoFocus } from '../lib/useAutoFocus';
import { HandGrid } from './HandGrid';
import { ArrowRightIcon, CheckIcon, CrossIcon, SplitIcon } from './icons';

/**
 * Shared feedback for one answered question.
 *
 * Everything here is contract-level and drill-agnostic: the verdict, the
 * expected action, the explanation, and the chart for `explanation.range_id`.
 * Only *which cell to highlight* is drill-specific, and that comes from the
 * registry rather than from a branch on the drill id.
 *
 * The outcome is stated four ways, and the redundancy is the point — a player
 * mid-session is reading this in half a second:
 *
 *  - a **shape**: tick, split arrows, cross. Survives greyscale and any form
 *    of colour blindness, which a green-or-red panel does not.
 *  - a **word**: the heading says what happened.
 *  - a **colour**: the same validated series slots the charts use, so "correct"
 *    is the same green everywhere in the app.
 *  - **motion**: the stage around the prompt pulses once, and misses shake.
 *    Decoration on top of the other three, and removed entirely under
 *    `prefers-reduced-motion`.
 */

const VERDICT_COPY: Record<
  Verdict,
  { title: string; tone: string; Icon: ComponentType<{ className?: string }> }
> = {
  // A mixed spot is neither a win nor a loss, and must not read as either.
  correct: { title: 'Correct', tone: 'var(--good)', Icon: CheckIcon },
  mixed: {
    title: 'Acceptable — this is a mixed spot',
    tone: 'var(--warn)',
    Icon: SplitIcon,
  },
  incorrect: {
    title: 'Not the chart action',
    tone: 'var(--bad)',
    Icon: CrossIcon,
  },
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
    // Not a live region: the runner announces a one-sentence verdict instead,
    // because reading a 169-cell chart aloud after every answer is unusable.
    // Key handling also lives in the runner, so there is one owner of it.
    <section aria-label="Feedback" className="space-y-5">
      <div
        data-verdict={verdict}
        className="bg-surface overflow-hidden rounded-xl border"
        style={{
          borderColor: `color-mix(in srgb, ${copy.tone} 45%, var(--line))`,
          boxShadow: 'var(--shadow-raised)',
          animation: 'verdict-in 220ms ease-out',
        }}
      >
        <div
          className="flex items-center gap-3 px-4 py-3"
          style={{
            background: `color-mix(in srgb, ${copy.tone} 12%, transparent)`,
            borderBottom: `1px solid color-mix(in srgb, ${copy.tone} 30%, transparent)`,
          }}
        >
          <span
            aria-hidden="true"
            className="grid size-9 shrink-0 place-items-center rounded-full text-lg"
            style={{
              background: copy.tone,
              color: 'var(--viz-ink)',
              animation: 'stamp-in 320ms cubic-bezier(0.2, 0.9, 0.3, 1)',
            }}
          >
            <copy.Icon />
          </span>
          <p className="text-fg text-base font-semibold tracking-tight">
            {copy.title}
          </p>
        </div>

        <div className="space-y-2 px-4 py-3">
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
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          ref={nextRef}
          type="button"
          onClick={onNext}
          disabled={busy}
          aria-keyshortcuts="Enter Space"
          className={cn(
            'bg-accent text-accent-fg inline-flex min-h-11 items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold tracking-tight',
            'transition-transform duration-100 enabled:hover:-translate-y-0.5 enabled:active:translate-y-0',
            busy && 'opacity-50'
          )}
          style={{ boxShadow: 'var(--shadow-raised)' }}
        >
          Next hand
          <ArrowRightIcon className="text-base" />
        </button>
        <span className="text-fg-muted text-xs">
          or press{' '}
          <kbd className="border-line rounded border px-1.5 py-0.5 font-mono text-[0.625rem]">
            Enter
          </kbd>
        </span>
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
    </section>
  );
}
