import { cn } from '../lib/cn';

/**
 * One playing card, from the contract's `rank + lowercase suit` notation
 * (API-CONTRACT §1): `Ah`, `Ks`, `Td`, `2c`.
 *
 * Suit is never carried by colour alone. Every card shows its glyph *and* its
 * suit name in the accessible label, so the card is readable in greyscale, with
 * any form of colour blindness, and to a screen reader.
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

export interface CardProps {
  /** Rank plus lowercase suit, e.g. `Ah`. */
  card: string;
  size?: 'md' | 'lg';
  className?: string;
}

export function Card({ card, size = 'lg', className }: CardProps) {
  const rank = card[0] ?? '?';
  const suitKey = card[1] ?? '';

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
  // The traditional two-colour deck. Colour is decoration here: the glyph and
  // the label already carry the suit.
  const red = suitKey === 'h' || suitKey === 'd';

  return (
    <span
      role="img"
      aria-label={`${rankName} of ${suitName}`}
      data-card={card}
      data-suit={suitKey}
      className={cn(
        'border-line inline-flex flex-col items-center justify-center rounded-lg border bg-white font-mono leading-none shadow-sm',
        size === 'lg'
          ? 'h-20 w-14 gap-1 text-2xl'
          : 'h-12 w-9 gap-0.5 text-base',
        className
      )}
      style={{ color: red ? '#c0392b' : '#1c1c1c' }}
    >
      <span className="font-semibold">{rank}</span>
      <span
        aria-hidden="true"
        className={size === 'lg' ? 'text-xl' : 'text-sm'}
      >
        {SUIT_GLYPHS[suitKey]}
      </span>
    </span>
  );
}

/** The two hole cards, with the shorthand notation beside them. */
export function HoleCards({
  cards,
  notation,
  className,
}: {
  cards: readonly string[];
  notation?: string;
  className?: string;
}) {
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <div className="flex gap-2">
        {cards.map((card, index) => (
          <Card key={`${card}-${index}`} card={card} />
        ))}
      </div>
      {notation ? (
        <span className="text-fg-muted font-mono text-lg">{notation}</span>
      ) : null}
    </div>
  );
}
