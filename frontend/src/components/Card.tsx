import type { CSSProperties } from 'react';

import { cn } from '../lib/cn';

/**
 * One playing card, from the contract's `rank + lowercase suit` notation
 * (API-CONTRACT §1): `Ah`, `Ks`, `Td`, `2c`.
 *
 * Suit is never carried by colour alone. Every card shows its glyph *and* its
 * suit name in the accessible label, so the card is readable in greyscale, with
 * any form of colour blindness, and to a screen reader.
 *
 * The face is laid out the way a real card is — a rank-over-suit index in the
 * top-left corner, the same index rotated in the bottom-right, and a large pip
 * in the middle. That redundancy is not decoration: it is what lets the card
 * stay recognisable when it is half-covered by its partner on the table.
 */

const SUIT_NAMES = {
  s: 'spades',
  h: 'hearts',
  d: 'diamonds',
  c: 'clubs',
} as const;

const SUIT_GLYPHS = {
  s: '♠',
  h: '♥',
  d: '♦',
  c: '♣',
} as const;

type SuitKey = keyof typeof SUIT_NAMES;

const RANK_NAMES: Record<string, string> = {
  A: 'ace',
  K: 'king',
  Q: 'queen',
  J: 'jack',
  T: 'ten',
  '9': 'nine',
  '8': 'eight',
  '7': 'seven',
  '6': 'six',
  '5': 'five',
  '4': 'four',
  '3': 'three',
  '2': 'two',
};

function isSuit(value: string): value is SuitKey {
  return value in SUIT_NAMES;
}

export type CardSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

/** Card geometry per size: box, corner index, centre pip. */
const SIZES: Record<
  CardSize,
  { box: string; index: string; pip: string; radius: string }
> = {
  xs: {
    box: 'h-6.5 w-4.5',
    index: 'text-[0.4rem]',
    pip: 'text-[0.6rem]',
    radius: 'rounded-sm',
  },
  sm: {
    box: 'h-9 w-6.5',
    index: 'text-[0.5rem]',
    pip: 'text-xs',
    radius: 'rounded',
  },
  md: {
    box: 'h-12 w-9',
    index: 'text-[0.625rem]',
    pip: 'text-lg',
    radius: 'rounded-md',
  },
  lg: {
    box: 'h-20 w-14',
    index: 'text-xs',
    pip: 'text-3xl',
    radius: 'rounded-lg',
  },
  xl: {
    box: 'h-24 w-17',
    index: 'text-sm',
    pip: 'text-4xl',
    radius: 'rounded-lg',
  },
};

export interface CardProps {
  /** Rank plus lowercase suit, e.g. `Ah`. */
  card: string;
  size?: CardSize;
  /** Degrees of tilt, so a pair of cards can fan the way dealt cards do. */
  tilt?: number;
  className?: string;
}

export function Card({ card, size = 'lg', tilt = 0, className }: CardProps) {
  const rank = card[0] ?? '?';
  const suitKey = card[1] ?? '';
  const geometry = SIZES[size];

  if (!isSuit(suitKey)) {
    return (
      <span
        role="img"
        aria-label={`unknown card ${card}`}
        className={className}
      >
        {card}
      </span>
    );
  }

  const suitName = SUIT_NAMES[suitKey];
  const rankName = RANK_NAMES[rank] ?? rank;
  const glyph = SUIT_GLYPHS[suitKey];
  // The traditional two-colour deck. Colour is decoration here: the glyph and
  // the label already carry the suit.
  const red = suitKey === 'h' || suitKey === 'd';
  const ink = red ? 'var(--card-ink-red)' : 'var(--card-ink)';

  const index = (
    <span
      aria-hidden="true"
      className={cn(
        'flex flex-col items-center leading-none font-semibold',
        geometry.index
      )}
    >
      <span>{rank}</span>
      <span className="-mt-px">{glyph}</span>
    </span>
  );

  return (
    <span
      role="img"
      aria-label={`${rankName} of ${suitName}`}
      data-card={card}
      data-suit={suitKey}
      className={cn(
        'relative isolate inline-flex shrink-0 font-sans select-none',
        geometry.box,
        geometry.radius,
        className
      )}
      style={
        {
          color: ink,
          // A dealt card is never perfectly flat white: the face is warm, and it
          // catches a little light along the top-left edge.
          background:
            'linear-gradient(155deg, #ffffff 0%, var(--card-face) 45%, #f2efe8 100%)',
          boxShadow:
            '0 0 0 1px oklch(0% 0 0 / 0.22), 0 1px 1px oklch(0% 0 0 / 0.18), 0 6px 14px -4px oklch(0% 0 0 / 0.45)',
          '--card-tilt': `${tilt}deg`,
          transform: `rotate(${tilt}deg)`,
          animation: 'deal-in 320ms cubic-bezier(0.2, 0.9, 0.3, 1) backwards',
        } as CSSProperties
      }
    >
      <span className="absolute top-0.5 left-0.5">{index}</span>
      <span className="absolute right-0.5 bottom-0.5 rotate-180">{index}</span>
      <span
        aria-hidden="true"
        className={cn(
          'absolute inset-0 flex items-center justify-center leading-none',
          geometry.pip
        )}
        style={{ opacity: 0.92 }}
      >
        {glyph}
      </span>
    </span>
  );
}

/**
 * A face-down card. Used for seats that folded, where the point is that there
 * *was* a hand and it is gone — a blank gap says the seat was empty, which is a
 * different table.
 */
export function CardBack({
  size = 'sm',
  tilt = 0,
  className,
}: {
  size?: CardSize;
  tilt?: number;
  className?: string;
}) {
  const geometry = SIZES[size];
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-block shrink-0',
        geometry.box,
        geometry.radius,
        className
      )}
      style={{
        transform: `rotate(${tilt}deg)`,
        background: `
          repeating-linear-gradient(45deg, oklch(100% 0 0 / 0.09) 0 2px, transparent 2px 4px),
          linear-gradient(160deg, var(--rail-hi), var(--rail))`,
        boxShadow:
          '0 0 0 1px oklch(0% 0 0 / 0.35), inset 0 0 0 1.5px color-mix(in srgb, var(--gold) 28%, transparent)',
      }}
    />
  );
}

/**
 * The two hole cards, fanned, with the shorthand notation beside them.
 *
 * The notation is the label a chart is indexed by, so it is set in the mono
 * face and given the weight of a heading — it is the thing a player will be
 * looking up two seconds later.
 */
export function HoleCards({
  cards,
  notation,
  size = 'lg',
  className,
}: {
  cards: readonly string[];
  notation?: string;
  size?: CardSize;
  className?: string;
}) {
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <div className="flex items-end -space-x-2">
        {cards.map((card, index) => {
          // Fan evenly whatever the count: two cards keep the original lean,
          // four PLO cards spread across the same arc.
          const middle = (cards.length - 1) / 2;
          const tilt = cards.length === 2 ? (index === 0 ? -7 : 6) : (index - middle) * 4.5;
          return (
            <Card
              key={`${card}-${index}`}
              card={card}
              size={size}
              tilt={tilt}
              className={index === 0 ? 'z-10' : ''}
            />
          );
        })}
      </div>
      {notation ? (
        <span className="text-fg font-mono text-lg font-semibold tracking-tight">
          {notation}
        </span>
      ) : null}
    </div>
  );
}
