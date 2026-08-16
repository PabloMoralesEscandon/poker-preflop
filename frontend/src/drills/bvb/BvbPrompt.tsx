import type { BvbPrompt as BvbPromptData, Position } from '../../api';
import { HoleCards } from '../../components/Card';
import { formatBb } from '../../lib/bb';
import { cn } from '../../lib/cn';
import type { DrillPromptProps } from '../registry';

/**
 * Blind versus blind: the big blind responding to the small blind.
 *
 * The whole drill turns on one fact, so the component is built around making it
 * impossible to miss: **what the small blind did decides which actions are
 * legal.** After a limp hero is already in for free, so folding is irrational
 * and the server does not offer it (RANGE-DATA-FORMAT §9); after a raise it is
 * an ordinary facing-a-raise spot and fold is back.
 *
 * That distinction is carried three ways, none of them colour alone:
 *
 *  - a banner naming the branch in words, with the size it involves;
 *  - the seat strip, where the small blind is marked `limped` or `raised`;
 *  - the cost line, which says "nothing to call" rather than "0bb".
 *
 * As everywhere else, `actions` is rendered exactly as the server sent it. No
 * fold button is synthesised, no action is reordered, and no sizing is computed
 * here — if fold is absent it is absent, which is the point.
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

/** What the small blind did, in the words the banner and seat strip use. */
function branchCopy(prompt: BvbPromptData): {
  verb: string;
  headline: string;
  consequence: string;
} {
  if (prompt.sb_action === 'limp') {
    return {
      verb: 'limped',
      headline: `${POSITION_NAMES[prompt.vs_position]} limped for ${formatBb(prompt.facing_size_bb)}`,
      // Said plainly, because it is the reason there is no fold button below.
      consequence: 'You are in for free — there is nothing to call.',
    };
  }
  return {
    verb: 'raised',
    headline: `${POSITION_NAMES[prompt.vs_position]} raised to ${formatBb(prompt.facing_size_bb)}`,
    consequence: 'You are facing a raise and must put in chips to continue.',
  };
}

export function BvbPrompt({
  prompt,
  actions,
  onAction,
  disabled = false,
  shortcuts = [],
}: DrillPromptProps<BvbPromptData>) {
  const keyFor = (actionId: string) =>
    shortcuts.find((shortcut) => shortcut.actionId === actionId)?.key;

  const branch = branchCopy(prompt);
  const limped = prompt.sb_action === 'limp';
  // Heads-up by the time hero acts: the two blinds, in order.
  const seats: Position[] = [prompt.vs_position, prompt.hero_position];

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
            {prompt.table_format} · {prompt.stack_bb}bb · blind vs blind
          </p>
        </div>

        {/*
          The banner. It is the first thing in the card and it names the branch
          in words, because everything below it — including whether a fold
          button exists — follows from this one line.
        */}
        <p
          data-sb-action={prompt.sb_action}
          className={cn(
            'rounded-md border-l-4 py-2 pr-3 pl-3 text-sm',
            limped
              ? 'border-l-[var(--viz-series-3)] bg-[color-mix(in_srgb,var(--viz-series-3)_10%,transparent)]'
              : 'border-l-[var(--viz-series-2)] bg-[color-mix(in_srgb,var(--viz-series-2)_10%,transparent)]'
          )}
        >
          <span className="text-fg font-semibold">{branch.headline}</span>{' '}
          <span className="text-fg-muted">{branch.consequence}</span>
        </p>

        {/* Two seats, not a ring: blind versus blind is already heads-up. */}
        <ol
          aria-label="Table positions"
          className="flex flex-wrap items-stretch gap-1"
        >
          {seats.map((position) => {
            const isHero = position === prompt.hero_position;
            return (
              <li
                key={position}
                data-position={position}
                data-seat={isHero ? 'hero' : prompt.sb_action}
                className={cn(
                  'rounded-md border px-2 py-1 text-center font-mono text-xs',
                  isHero
                    ? 'border-accent bg-accent text-accent-fg font-semibold'
                    : // The branch hue lives on the border and a tint, never on
                      // the text: #1baf7a as a foreground is 2.8:1 on the card
                      // and #eb6834 is 3.2:1, both short of AA. Measured in a
                      // real browser, resolving oklch through a canvas pixel.
                      cn(
                        'text-fg font-semibold',
                        limped
                          ? 'border-[var(--viz-series-3)] bg-[color-mix(in_srgb,var(--viz-series-3)_14%,transparent)]'
                          : 'border-[var(--viz-series-2)] bg-[color-mix(in_srgb,var(--viz-series-2)_14%,transparent)]'
                      )
                )}
              >
                {position}
                <span className="sr-only">
                  {isHero ? ' — you' : ` — ${branch.verb}`}
                </span>
              </li>
            );
          })}
        </ol>

        <HoleCards cards={prompt.hand.cards} notation={prompt.hand.notation} />

        <dl className="text-fg-muted flex flex-wrap gap-x-6 gap-y-1 font-mono text-xs">
          <div className="flex gap-2">
            <dt>Pot</dt>
            <dd className="text-fg">{formatBb(prompt.pot_bb)}</dd>
          </div>
          <div className="flex gap-2">
            <dt>To call</dt>
            {/*
              `to_call_bb` is 0.0 after a limp. "0bb" would read as a missing
              value; "nothing" is what is actually true.
            */}
            <dd className="text-fg">
              {prompt.to_call_bb === 0
                ? 'nothing'
                : formatBb(prompt.to_call_bb)}
            </dd>
          </div>
        </dl>
      </div>

      <div
        role="group"
        aria-label="Your action"
        className="flex flex-wrap gap-2"
      >
        {actions.map((action) => {
          const key = keyFor(action.id);
          // `check` costs nothing but is a real action, so it gets the same
          // weight as any other line — it is only `fold` that recedes.
          const passive = action.id === 'fold';
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
                passive
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
                    passive
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
