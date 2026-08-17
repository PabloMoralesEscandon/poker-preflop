import type { ReactNode } from 'react';

import { cn } from '../lib/cn';

/**
 * The chrome every spot is presented in.
 *
 * The three prompts were each carrying their own copy of this frame, header
 * and stat row; they differ only in what they *say*, never in how it is
 * arranged. Keeping the arrangement here means a new drill inherits the layout
 * for free and cannot drift from it, which is the same bargain the rest of the
 * platform makes.
 */

export function SpotFrame({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'border-line bg-surface overflow-hidden rounded-2xl border',
        className
      )}
      style={{ boxShadow: 'var(--shadow-raised)' }}
    >
      {children}
    </div>
  );
}

/**
 * Who hero is and what the table is.
 *
 * The seat is a heading because it is the answer to "where am I", the first
 * question a player asks and the one every chart is indexed by.
 */
export function SpotHeader({
  seatName,
  seatId,
  meta,
}: {
  seatName: string;
  seatId: string;
  /**
   * One line of facts: format, stack depth, and whatever else the drill thinks
   * belongs in the corner. Deliberately a single string rather than a list of
   * chips — it reads as one sentence of context, and a screen reader gets it
   * as one.
   */
  meta: string;
}) {
  return (
    <div className="border-line bg-surface-muted/60 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b px-4 py-3 sm:px-5">
      <h2 className="text-fg flex items-baseline gap-2 text-lg font-semibold tracking-tight">
        {seatName}
        <span className="text-fg-muted font-mono text-sm font-normal">
          ({seatId})
        </span>
      </h2>
      <p className="text-fg-muted font-mono text-xs">{meta}</p>
    </div>
  );
}

/**
 * The line that says what has happened so far, in words.
 *
 * `tone` tints the rule down its left edge. It is the third carrier of the
 * same fact, never the first: the sentence inside says it outright.
 */
export function SpotNarrative({
  tone = 'neutral',
  marker,
  children,
}: {
  tone?: 'neutral' | 'good' | 'warn' | 'bad';
  /** `data-*` attributes a drill needs to hang off this line. */
  marker?: Record<string, string>;
  children: ReactNode;
}) {
  const colour =
    tone === 'neutral'
      ? 'var(--line)'
      : tone === 'good'
        ? 'var(--good)'
        : tone === 'bad'
          ? 'var(--bad)'
          : 'var(--warn)';

  return (
    <p
      className="rounded-md border-l-4 py-2 pr-3 pl-3 text-sm"
      style={{
        borderLeftColor: colour,
        background:
          tone === 'neutral'
            ? 'transparent'
            : `color-mix(in srgb, ${colour} 10%, transparent)`,
      }}
      {...marker}
    >
      {children}
    </p>
  );
}

/**
 * Hero's hand, named.
 *
 * The cards themselves are on the felt; this is the shorthand a chart is
 * looked up by, so it is set large and in the mono face — it is the string the
 * player will be searching the grid for two seconds from now.
 */
export function HandLabel({ notation }: { notation: string }) {
  return (
    <span className="inline-flex items-baseline gap-2">
      <span className="text-fg-muted text-[0.6875rem] tracking-wide uppercase">
        your hand
      </span>
      <span className="text-fg font-mono text-xl leading-none font-bold tracking-tight">
        {notation}
      </span>
    </span>
  );
}

export interface SpotStat {
  term: string;
  /** Pre-formatted. Nothing in this file computes a size. */
  value: string;
}

/** Pot, price, and anything else the server states outright. */
export function SpotStats({
  items,
  className,
}: {
  items: readonly SpotStat[];
  className?: string;
}) {
  return (
    <dl
      className={cn(
        'text-fg-muted flex flex-wrap items-baseline gap-x-5 gap-y-1 font-mono text-xs',
        className
      )}
    >
      {items.map((item) => (
        <div key={item.term} className="flex items-baseline gap-2">
          <dt className="tracking-wide uppercase">{item.term}</dt>
          <dd className="text-fg text-sm font-semibold">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** The strip under the felt: hand on the left, prices on the right. */
export function SpotFooter({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'border-line flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-t px-4 py-3 sm:px-5',
        className
      )}
    >
      {children}
    </div>
  );
}
