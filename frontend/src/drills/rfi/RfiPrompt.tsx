import type { Position, RfiPrompt as RfiPromptData } from '../../api';
import { POSITIONS_BY_FORMAT } from '../../api';
import { HoleCards } from '../../components/Card';
import { cn } from '../../lib/cn';
import type { DrillPromptProps } from '../registry';

/**
 * The RFI spot: everything a player needs to read the situation at a glance —
 * where they are sitting, what they hold, how deep they are, and who has
 * already folded.
 *
 * Action labels come from the server and are rendered verbatim. This component
 * never computes a raise size.
 */

const POSITION_NAMES: Record<Position, string> = {
  UTG: 'Under the gun',
  UTG1: 'UTG+1',
  LJ: 'Lojack',
  HJ: 'Hijack',
  CO: 'Cutoff',
  BTN: 'Button',
  SB: 'Small blind',
  BB: 'Big blind',
};

/**
 * The seat order for a format.
 *
 * Falls back to reconstructing the table from the prompt itself if the server
 * sends a format this build has never heard of. Table formats are a wire enum
 * declared in two languages (see RANGE-DATA-FORMAT §intro), so the two services
 * can legitimately disagree for the length of one deploy — and a stale build
 * should degrade to a slightly vaguer table strip, not a blank screen.
 */
function seatOrder(prompt: RfiPromptData): readonly Position[] {
  return (
    POSITIONS_BY_FORMAT[prompt.table_format] ?? [
      ...prompt.folded_before,
      prompt.hero_position,
    ]
  );
}

/** Where the hero sits relative to the blinds, in plain language. */
function seatDescription(prompt: RfiPromptData): string {
  const { hero_position: hero } = prompt;
  const order = seatOrder(prompt);
  const heroIndex = order.indexOf(hero);
  const toAct = order.length - 1 - heroIndex;

  if (hero === 'SB') return 'first to act after the flop, one player behind';
  if (hero === 'BTN') return 'last to act after the flop';
  if (toAct === 1) return '1 player left to act';
  if (toAct < 1) return 'the pot is unopened';
  return `${toAct} players left to act`;
}

export function RfiPrompt({
  prompt,
  actions,
  onAction,
  disabled = false,
  shortcuts = [],
}: DrillPromptProps<RfiPromptData>) {
  const keyFor = (actionId: string) =>
    shortcuts.find((shortcut) => shortcut.actionId === actionId)?.key;
  const order = seatOrder(prompt);
  const folded = new Set(prompt.folded_before);

  return (
    <section className="space-y-6">
      <div className="border-line bg-surface space-y-5 rounded-lg border p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 className="text-fg text-lg font-semibold">
            {POSITION_NAMES[prompt.hero_position]}{' '}
            <span className="text-fg-muted font-mono text-sm">
              ({prompt.hero_position})
            </span>
          </h2>
          <p className="text-fg-muted font-mono text-xs">
            {prompt.table_format} · {prompt.stack_bb}bb · {prompt.pot_bb}bb in
            the pot
          </p>
        </div>

        <p className="text-fg-muted text-sm">
          {seatDescription(prompt)}. The pot is unopened.
        </p>

        {/* The seat strip: who folded, where you are, who is still to act. */}
        <ol
          aria-label="Table positions"
          className="flex flex-wrap items-stretch gap-1"
        >
          {order.map((position) => {
            const isHero = position === prompt.hero_position;
            const hasFolded = folded.has(position);
            return (
              <li
                key={position}
                data-position={position}
                data-seat={isHero ? 'hero' : hasFolded ? 'folded' : 'to-act'}
                className={cn(
                  'rounded-md border px-2 py-1 text-center font-mono text-xs',
                  isHero
                    ? 'border-accent bg-accent text-accent-fg font-semibold'
                    : hasFolded
                      ? 'border-line text-fg-muted line-through opacity-60'
                      : 'border-line text-fg'
                )}
              >
                {position}
                <span className="sr-only">
                  {isHero
                    ? ' — you'
                    : hasFolded
                      ? ' — folded'
                      : ' — still to act'}
                </span>
              </li>
            );
          })}
        </ol>

        <HoleCards cards={prompt.hand.cards} notation={prompt.hand.notation} />
      </div>

      <div
        role="group"
        aria-label="Your action"
        className="flex flex-wrap gap-2"
      >
        {actions.map((action) => {
          const key = keyFor(action.id);
          return (
            <button
              key={action.id}
              type="button"
              data-action-id={action.id}
              data-shortcut={key}
              disabled={disabled}
              onClick={() => onAction(action.id)}
              aria-keyshortcuts={key}
              aria-label={key ? `${action.label} (key ${key})` : action.label}
              className={cn(
                'border-line flex min-h-11 min-w-28 flex-1 items-center justify-center gap-2 rounded-md border px-4 py-2.5 text-sm font-medium sm:flex-none',
                action.id === 'fold'
                  ? 'bg-surface text-fg'
                  : 'bg-accent text-accent-fg border-transparent',
                disabled && 'opacity-50'
              )}
            >
              <span>{action.label}</span>
              {key ? (
                <kbd
                  aria-hidden="true"
                  className={cn(
                    'rounded border px-1.5 py-0.5 font-mono text-[0.625rem] uppercase',
                    action.id === 'fold'
                      ? 'border-line text-fg-muted'
                      : 'border-accent-fg/40 text-accent-fg/80'
                  )}
                >
                  {key}
                </kbd>
              ) : null}
            </button>
          );
        })}
      </div>
    </section>
  );
}
