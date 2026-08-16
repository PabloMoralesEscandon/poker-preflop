import {
  POSITIONS_BY_FORMAT,
  type Position,
  type VsRfiPrompt as VsRfiPromptData,
} from '../../api';
import { HoleCards } from '../../components/Card';
import { formatBb } from '../../lib/bb';
import { cn } from '../../lib/cn';
import type { DrillPromptProps } from '../registry';

/**
 * Facing a single raise. The spot has to read in one glance: who raised, from
 * where, for how much, what the pot is now, and what continuing costs.
 *
 * `pot_bb` and `to_call_bb` arrive computed from the server. This component
 * never derives them — hero has already posted a blind in most of these spots,
 * so what they still owe is not the raise size, and that arithmetic is exactly
 * the kind the contract keeps on one side of the wire.
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

function seatOrder(prompt: VsRfiPromptData): readonly Position[] {
  return (
    POSITIONS_BY_FORMAT[prompt.table_format] ?? [
      prompt.raiser_position,
      ...prompt.folded_before,
      prompt.hero_position,
    ]
  );
}

/** Whether hero acts after the raiser once the flop comes. */
function inPosition(prompt: VsRfiPromptData): boolean {
  const order = seatOrder(prompt);
  const hero = order.indexOf(prompt.hero_position);
  const raiser = order.indexOf(prompt.raiser_position);
  if (hero < 0 || raiser < 0) return false;
  // The blinds act first postflop, so a later seat index is only an advantage
  // when hero is not in one of them.
  if (prompt.hero_position === 'SB' || prompt.hero_position === 'BB') {
    return false;
  }
  return hero > raiser;
}

export function VsRfiPrompt({
  prompt,
  actions,
  onAction,
  disabled = false,
  shortcuts = [],
}: DrillPromptProps<VsRfiPromptData>) {
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
            {prompt.table_format} · {prompt.stack_bb}bb ·{' '}
            {inPosition(prompt) ? 'in position' : 'out of position'}
          </p>
        </div>

        <p className="text-fg text-sm">
          <span className="font-medium">
            {POSITION_NAMES[prompt.raiser_position]}
          </span>{' '}
          <span className="text-fg-muted font-mono">
            ({prompt.raiser_position})
          </span>{' '}
          raised to{' '}
          <span className="font-medium">{formatBb(prompt.facing_size_bb)}</span>
          .
        </p>

        {/* The seat strip: raiser, folds, and you. */}
        <ol
          aria-label="Table positions"
          className="flex flex-wrap items-stretch gap-1"
        >
          {order.map((position) => {
            const isHero = position === prompt.hero_position;
            const isRaiser = position === prompt.raiser_position;
            const hasFolded = folded.has(position);
            return (
              <li
                key={position}
                data-position={position}
                data-seat={
                  isHero
                    ? 'hero'
                    : isRaiser
                      ? 'raiser'
                      : hasFolded
                        ? 'folded'
                        : 'to-act'
                }
                className={cn(
                  'rounded-md border px-2 py-1 text-center font-mono text-xs',
                  isHero
                    ? 'border-accent bg-accent text-accent-fg font-semibold'
                    : isRaiser
                      ? 'font-semibold text-[var(--viz-series-2)]'
                      : hasFolded
                        ? 'border-line text-fg-muted line-through opacity-60'
                        : 'border-line text-fg',
                  isRaiser && 'border-[var(--viz-series-2)]'
                )}
              >
                {position}
                <span className="sr-only">
                  {isHero
                    ? ' — you'
                    : isRaiser
                      ? ' — raised'
                      : hasFolded
                        ? ' — folded'
                        : ' — still to act'}
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
            <dd className="text-fg">{formatBb(prompt.to_call_bb)}</dd>
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
