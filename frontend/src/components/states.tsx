import { ApiError } from '../api';
import { cn } from '../lib/cn';
import type { Verdict } from '../lib/verdict';
import { FlameIcon } from './icons';

/** Shared loading / error / progress chrome for the drill runner. */

export function LoadingState({ label }: { label: string }) {
  return (
    <div role="status" className="flex items-center gap-3 py-8">
      {/* A card being dealt face down — the wait is short and this says what
          kind of wait it is. */}
      <span
        aria-hidden="true"
        className="h-7 w-5 rounded"
        style={{
          background:
            'linear-gradient(160deg, var(--rail-hi), var(--rail)), repeating-linear-gradient(45deg, oklch(100% 0 0 / 0.08) 0 2px, transparent 2px 4px)',
          boxShadow:
            'inset 0 0 0 1.5px color-mix(in srgb, var(--gold) 30%, transparent)',
          animation: 'deal-in 700ms ease-out infinite alternate',
        }}
      />
      <p className="text-fg-muted text-sm">{label}</p>
    </div>
  );
}

/**
 * Errors are switched on the contract's `code`, never on `message`. The message
 * is shown as detail, but the guidance comes from the code.
 */
export function ErrorState({
  error,
  onRetry,
}: {
  error: unknown;
  onRetry?: () => void;
}) {
  const { heading, hint } = describeError(error);
  const detail = error instanceof Error ? error.message : String(error);

  return (
    <div
      role="alert"
      className="bg-surface space-y-3 rounded-xl border p-4"
      style={{
        borderColor: 'color-mix(in srgb, var(--bad) 45%, var(--line))',
        boxShadow: 'var(--shadow-raised)',
      }}
    >
      <p className="text-fg text-sm font-semibold">{heading}</p>
      <p className="text-fg-muted text-sm">{hint}</p>
      <p className="text-fg-muted font-mono text-xs">{detail}</p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="border-line text-fg hover:border-fg-muted rounded-md border px-3 py-1.5 text-sm font-medium"
        >
          Try again
        </button>
      ) : null}
    </div>
  );
}

function describeError(error: unknown): { heading: string; hint: string } {
  if (!(error instanceof ApiError)) {
    return {
      heading: 'Something went wrong',
      hint: 'The app hit an unexpected problem.',
    };
  }

  switch (error.code) {
    case 'session_not_found':
      return {
        heading: 'This session has expired',
        hint: 'Sessions are held in memory and are lost when the server restarts. Start a new one.',
      };
    case 'drill_not_found':
      return {
        heading: 'Unknown drill',
        hint: 'That drill is not available on this server.',
      };
    case 'range_not_found':
      return {
        heading: 'Chart not available',
        hint: 'The range for this spot has not been added yet.',
      };
    case 'invalid_config':
      return {
        heading: 'Those settings are not valid',
        hint: error.field
          ? `Check the "${error.field}" setting and try again.`
          : 'Check the settings and try again.',
      };
    case 'invalid_request':
      return {
        heading: 'The server rejected the request',
        hint: 'This is a bug in the app rather than something you did.',
      };
    case 'question_out_of_order':
    case 'question_already_answered':
      return {
        heading: 'That hand has moved on',
        hint: 'The session advanced past this question. Continue with the current one.',
      };
    case 'internal_error':
      return {
        heading: 'The server had a problem',
        hint: 'Try again in a moment.',
      };
  }
}

/** Fill for one answered hand. Verdict order matches the feedback panel. */
const PIP_FILL: Record<Verdict, string> = {
  correct: 'var(--good)',
  mixed: 'var(--warn)',
  incorrect: 'var(--bad)',
};

const PIP_NAME: Record<Verdict, string> = {
  correct: 'correct',
  mixed: 'mixed spot',
  incorrect: 'missed',
};

/**
 * Session progress, hand by hand.
 *
 * A single filled bar answers "how far in am I" and nothing else. One pip per
 * hand answers that *and* "how am I doing", which is the question a player is
 * actually asking on hand nine — and it does it without them having to
 * remember. The run of colour is the session's shape at a glance.
 *
 * The pips are decoration over numbers that are already there: the counts to
 * their left say the same thing, and each pip carries its own title. Nothing is
 * knowable only from the colours.
 */
export function ProgressBar({
  answered,
  total,
  correct,
  results = [],
  streak = 0,
}: {
  answered: number;
  total: number;
  correct: number;
  /** One verdict per answered hand, oldest first. */
  results?: readonly Verdict[];
  /** How many hands in a row have been right, ending at the last one. */
  streak?: number;
}) {
  const fraction = total === 0 ? 0 : Math.min(answered / total, 1);
  const accuracy =
    answered === 0 ? null : Math.round((correct / answered) * 100);

  return (
    <div className="space-y-1.5">
      <div className="text-fg-muted flex flex-wrap items-baseline gap-x-3 font-mono text-xs">
        <span className="text-fg font-semibold">
          Hand {Math.min(answered + 1, total)} of {total}
        </span>

        {streak >= 3 ? (
          <span
            className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 font-sans text-[0.6875rem] font-semibold"
            style={{
              background: 'color-mix(in srgb, var(--gold) 22%, transparent)',
              color: 'var(--fg)',
            }}
          >
            <FlameIcon
              className="text-sm"
              style={{ color: 'var(--gold-deep)' }}
            />
            {streak} in a row
          </span>
        ) : null}

        <span className="ml-auto">
          {correct}/{answered} correct
          {accuracy === null ? '' : ` · ${accuracy}%`}
        </span>
      </div>

      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={answered}
        aria-label="Session progress"
        className="bg-surface-muted flex h-2 gap-px overflow-hidden rounded-full"
      >
        {total > 0 && total <= 40 ? (
          Array.from({ length: total }, (_, index) => {
            const result = results[index];
            const current = index === answered;
            return (
              <span
                key={index}
                title={
                  result
                    ? `Hand ${index + 1}: ${PIP_NAME[result]}`
                    : `Hand ${index + 1}: not played yet`
                }
                className={cn(
                  'h-full flex-1 transition-colors duration-200',
                  current && 'animate-pulse'
                )}
                style={{
                  background: result
                    ? PIP_FILL[result]
                    : // Neutral, deliberately. The three verdict fills are the
                      // only colours in this bar that mean anything, and a
                      // fourth coloured pip for "you are here" would read as a
                      // fourth outcome — the accent is already the same blue as
                      // a mixed spot.
                      current
                      ? 'color-mix(in srgb, var(--fg) 35%, transparent)'
                      : 'transparent',
                }}
              />
            );
          })
        ) : (
          // Long sessions get the plain bar back: 200 pips is not a readout.
          <span
            className="bg-accent h-full rounded-full transition-[width] duration-200"
            style={{ width: `${(fraction * 100).toFixed(1)}%` }}
          />
        )}
      </div>
    </div>
  );
}
