import { cn } from '../lib/cn';

/**
 * Casino chips, the dealer button, and the small stacks that sit in front of a
 * seat.
 *
 * A chip is drawn, not written: a coloured disc with edge spots and an inner
 * ring, the way a real one is moulded. What it *means* is always in the label
 * on its face and in the accessible name beside it — the colour is there so a
 * player recognises the table at a glance, never so they can work out an
 * amount from it.
 *
 * Nothing here computes a size. Every amount a chip displays is handed to it
 * by a prompt, which got it from the server.
 */

export type ChipTone = 'white' | 'red' | 'green' | 'blue' | 'black' | 'gold';

const TONE_BODY: Record<ChipTone, string> = {
  white: 'var(--chip-white)',
  red: 'var(--chip-red)',
  green: 'var(--chip-green)',
  blue: 'var(--chip-blue)',
  black: 'var(--chip-black)',
  gold: 'var(--gold)',
};

/** Ink on the chip face. Only the pale chips take dark ink. */
const TONE_INK: Record<ChipTone, string> = {
  white: '#1b1d22',
  red: '#fff',
  green: '#fff',
  blue: '#fff',
  black: '#fff',
  gold: '#2a2007',
};

/** The moulded edge spots, evenly spaced the way a real chip's are. */
const SPOT_ANGLES = [0, 60, 120, 180, 240, 300];

export interface ChipProps {
  tone?: ChipTone;
  /** Two or three characters at most: `SB`, `BB`, `D`, `2.5`. */
  label?: string;
  /** Full-word name, announced instead of the abbreviation on the face. */
  title?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const SIZES = {
  sm: 'size-6 text-[0.5rem]',
  md: 'size-8 text-[0.625rem]',
  lg: 'size-11 text-sm',
} as const;

export function Chip({
  tone = 'red',
  label,
  title,
  size = 'md',
  className,
}: ChipProps) {
  const body = TONE_BODY[tone];
  const ink = TONE_INK[tone];
  const spot = tone === 'white' ? 'var(--chip-black)' : 'var(--chip-white)';

  return (
    <span
      className={cn(
        'relative inline-grid shrink-0 place-items-center rounded-full',
        SIZES[size],
        className
      )}
      style={{
        background: body,
        boxShadow: `
          0 0 0 1px oklch(0% 0 0 / 0.35),
          inset 0 0 0 1.5px color-mix(in srgb, ${spot} 55%, transparent),
          inset 0 -2px 4px oklch(0% 0 0 / 0.28),
          inset 0 2px 3px oklch(100% 0 0 / 0.22),
          0 2px 4px oklch(0% 0 0 / 0.3)`,
      }}
      {...(title
        ? { role: 'img', 'aria-label': title }
        : { 'aria-hidden': true })}
    >
      {/* The edge spots. Drawn as six rotated slivers around the rim. */}
      {SPOT_ANGLES.map((angle) => (
        <span
          key={angle}
          aria-hidden="true"
          className="absolute inset-0"
          style={{ transform: `rotate(${angle}deg)` }}
        >
          <span
            className="absolute top-0 left-1/2 h-[22%] w-[26%] -translate-x-1/2 rounded-b-[2px]"
            style={{ background: spot, opacity: 0.85 }}
          />
        </span>
      ))}

      {/* The face: a flat inner disc the label sits on. */}
      <span
        aria-hidden="true"
        className="absolute inset-[22%] rounded-full"
        style={{
          background: `color-mix(in srgb, ${body} 88%, var(--chip-black))`,
          boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${spot} 30%, transparent)`,
        }}
      />

      {label ? (
        <span
          aria-hidden="true"
          className="relative font-mono leading-none font-bold tracking-tight"
          style={{ color: ink }}
        >
          {label}
        </span>
      ) : null}
    </span>
  );
}

/**
 * The dealer button.
 *
 * Not a chip — it is the flat white puck that marks the button seat, and
 * telling them apart at a glance is exactly what a player does at a real
 * table. It carries its own accessible name, because "who has the button" is
 * information and not decoration.
 */
export function DealerButton({
  size = 'md',
  className,
}: {
  size?: 'sm' | 'md';
  className?: string;
}) {
  return (
    <span
      role="img"
      aria-label="dealer button"
      className={cn(
        'relative inline-grid shrink-0 place-items-center rounded-full font-bold',
        size === 'sm' ? 'size-5 text-[0.5rem]' : 'size-7 text-xs',
        className
      )}
      style={{
        background:
          'radial-gradient(circle at 35% 28%, #ffffff, #e6e2d6 62%, #c9c3b2)',
        color: 'var(--rail)',
        boxShadow: `
          0 0 0 1.5px var(--gold-deep),
          inset 0 0 0 1.5px color-mix(in srgb, var(--gold) 45%, transparent),
          0 2px 5px oklch(0% 0 0 / 0.4)`,
      }}
    >
      <span aria-hidden="true" className="font-display leading-none">
        D
      </span>
    </span>
  );
}

/**
 * Chips pushed into the middle: a short stack, with the amount beside it.
 *
 * The stack height is cosmetic and capped at three — it says "there are chips
 * here", while the number says how many. A bet that grew a taller pile the
 * bigger it got would invite reading the pile instead of the number, and the
 * number is the one that came from the server.
 */
export function ChipStack({
  amount,
  tone = 'red',
  label,
  size = 'sm',
  className,
}: {
  /** Pre-formatted, e.g. `2.5bb`. Never derived here. */
  amount: string;
  tone?: ChipTone;
  /** What the chips are: `pot`, `raise`, `small blind`. */
  label: string;
  size?: 'sm' | 'md';
  className?: string;
}) {
  return (
    <span
      className={cn('flex items-center gap-1.5', className)}
      style={{ animation: 'chip-drop 320ms ease-out' }}
    >
      <span
        role="img"
        aria-label={`${label} ${amount}`}
        className="relative inline-block"
        style={{ width: size === 'sm' ? '1.5rem' : '2rem' }}
      >
        {[2, 1, 0].map((depth) => (
          <span
            key={depth}
            className="absolute left-0 block"
            style={{ bottom: `${depth * 3}px` }}
          >
            <Chip tone={tone} size={size} />
          </span>
        ))}
        {/* Holds the line's height: the stack above is absolutely placed. */}
        <span aria-hidden="true" className="invisible block">
          <Chip tone={tone} size={size} />
        </span>
      </span>
      <span
        aria-hidden="true"
        className="rounded px-1 py-0.5 font-mono text-[0.625rem] leading-none font-semibold"
        style={{
          background: 'oklch(0% 0 0 / 0.45)',
          color: 'var(--felt-fg)',
        }}
      >
        {amount}
      </span>
    </span>
  );
}
