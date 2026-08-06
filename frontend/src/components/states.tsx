import { ApiError } from '../api';

/** Shared loading / error / progress chrome for the drill runner. */

export function LoadingState({ label }: { label: string }) {
  return (
    <p role="status" className="text-fg-muted py-8 text-sm">
      {label}
    </p>
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
      className="border-line bg-surface space-y-3 rounded-lg border p-4"
    >
      <p className="text-fg text-sm font-medium">{heading}</p>
      <p className="text-fg-muted text-sm">{hint}</p>
      <p className="text-fg-muted font-mono text-xs">{detail}</p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="border-line text-fg rounded-md border px-3 py-1.5 text-sm"
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

export function ProgressBar({
  answered,
  total,
  correct,
}: {
  answered: number;
  total: number;
  correct: number;
}) {
  const fraction = total === 0 ? 0 : Math.min(answered / total, 1);

  return (
    <div className="space-y-1.5">
      <div className="text-fg-muted flex items-baseline justify-between font-mono text-xs">
        <span>
          Hand {Math.min(answered + 1, total)} of {total}
        </span>
        <span>
          {correct}/{answered} correct
        </span>
      </div>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={answered}
        aria-label="Session progress"
        className="bg-surface-muted h-1.5 overflow-hidden rounded-full"
      >
        <div
          className="bg-accent h-full rounded-full transition-[width] duration-200"
          style={{ width: `${(fraction * 100).toFixed(1)}%` }}
        />
      </div>
    </div>
  );
}
