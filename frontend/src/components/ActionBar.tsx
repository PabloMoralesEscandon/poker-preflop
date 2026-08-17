import type { CSSProperties } from 'react';

import type { ActionOption } from '../api';
import type { Shortcut } from '../lib/shortcuts';
import { cn } from '../lib/cn';

/**
 * The buttons a player presses.
 *
 * One component for every drill, because the three prompts had grown three
 * byte-identical copies of this markup and the fourth drill would have made
 * four. A drill hands over the actions the server sent and the bindings the
 * runner derived; nothing else is knowable from here.
 *
 * Two rules survive from those copies, and both matter:
 *
 *  - **Labels are rendered verbatim.** `Raise 2.5bb` is a string from the
 *    server. No size is computed, reformatted or abbreviated here.
 *  - **The action set is rendered as given.** No button is synthesised and none
 *    is reordered. Blind-versus-blind after a limp has no fold, and the absence
 *    is the lesson (RANGE-DATA-FORMAT §9).
 *
 * Exactly one action recedes, and it is always `fold`. Everything else — call,
 * check, limp, raise, 3-bet — is a decision to keep playing, and they are given
 * the same weight on purpose: checking behind a blind-versus-blind limp is
 * 59.6% of that chart, and a button that looked half-hearted next to the raise
 * would teach the opposite of what the chart says (BVB-CALIBRATION §2). Two
 * weights, not five, is a deliberate ceiling rather than an unfinished idea.
 */

type Weight = 'fold' | 'play';

function weightOf(actionId: string): Weight {
  return actionId === 'fold' ? 'fold' : 'play';
}

const WEIGHT_CLASS: Record<Weight, string> = {
  fold: 'bg-surface text-fg border-line hover:border-[var(--bad)] hover:text-[var(--bad)]',
  play: 'text-accent-fg border-transparent',
};

const WEIGHT_STYLE: Record<Weight, CSSProperties | undefined> = {
  fold: undefined,
  play: {
    background:
      'linear-gradient(180deg, color-mix(in srgb, var(--accent) 88%, white), var(--accent))',
    boxShadow:
      '0 1px 0 color-mix(in srgb, var(--gold) 55%, transparent) inset, 0 2px 8px -2px color-mix(in srgb, var(--accent) 60%, transparent)',
  },
};

export interface ActionBarProps {
  actions: readonly ActionOption[];
  onAction: (actionId: string) => void;
  disabled?: boolean;
  shortcuts?: readonly Shortcut[];
  className?: string;
}

export function ActionBar({
  actions,
  onAction,
  disabled = false,
  shortcuts = [],
  className,
}: ActionBarProps) {
  const keyFor = (actionId: string) =>
    shortcuts.find((shortcut) => shortcut.actionId === actionId)?.key;

  return (
    <div
      role="group"
      aria-label="Your action"
      className={cn('flex flex-wrap gap-2', className)}
    >
      {actions.map((action) => {
        const key = keyFor(action.id);
        const weight = weightOf(action.id);
        return (
          <button
            key={action.id}
            type="button"
            data-action-id={action.id}
            data-weight={weight}
            data-shortcut={key}
            disabled={disabled}
            onClick={() => onAction(action.id)}
            aria-keyshortcuts={key}
            aria-label={key ? `${action.label} (key ${key})` : action.label}
            className={cn(
              'flex min-h-11 min-w-28 flex-1 items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-semibold tracking-tight sm:flex-none',
              'transition-[transform,box-shadow,background-color,border-color,color] duration-100',
              'enabled:hover:-translate-y-0.5 enabled:active:translate-y-0 enabled:active:scale-[0.98]',
              WEIGHT_CLASS[weight],
              disabled && 'cursor-not-allowed opacity-60'
            )}
            // Applied whether or not the button is disabled. The fill is what
            // makes the pale label legible, so dropping it while the prompt is
            // frozen behind the feedback panel would leave white text on white
            // — and the frozen prompt is exactly when a player is re-reading
            // which line they took.
            style={WEIGHT_STYLE[weight]}
          >
            <span>{action.label}</span>
            {key ? (
              <kbd
                aria-hidden="true"
                className={cn(
                  'rounded border px-1.5 py-0.5 font-mono text-[0.625rem] uppercase',
                  weight === 'play'
                    ? 'border-accent-fg/40 text-accent-fg/85'
                    : 'border-line text-fg-muted'
                )}
              >
                {key}
              </kbd>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
