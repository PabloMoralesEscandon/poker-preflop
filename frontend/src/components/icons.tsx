import type { SVGProps } from 'react';

/**
 * The icon set.
 *
 * Every icon here is inline SVG on purpose. Two reasons, and both matter:
 *
 *  - **No text content.** An icon glyph placed inside a button would land in
 *    that button's accessible name and in `textContent`, so `Fold` would start
 *    reading as `♠Fold`. SVG contributes neither.
 *  - **No network.** Same rule as the fonts and the range data: an icon font or
 *    a sprite from a CDN would make the app need the internet to look right.
 *
 * They are decoration. Each is `aria-hidden` by default and every place one is
 * used already says the same thing in words, so an icon can be missing, blocked
 * or unrecognised without costing the user anything.
 */

type IconProps = SVGProps<SVGSVGElement>;

function Icon({ children, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Suits. Filled shapes rather than strokes, so they read at 10px.
// ---------------------------------------------------------------------------

export function SpadeIcon(props: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      <path d="M12 2.2 5.4 8.6a5.1 5.1 0 0 0 2 8.7 4.4 4.4 0 0 0 3.2-.6l-.9 4.1c-.1.5.2.9.7.9h3.2c.5 0 .8-.4.7-.9l-.9-4.1a4.4 4.4 0 0 0 3.2.6 5.1 5.1 0 0 0 2-8.7Z" />
    </svg>
  );
}

export function HeartIcon(props: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      <path d="M12 21.2 4.6 13.6a5.2 5.2 0 0 1 7.4-7.3a5.2 5.2 0 0 1 7.4 7.3Z" />
    </svg>
  );
}

export function DiamondIcon(props: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      <path d="M12 2.4c2.3 4 4.7 7.2 7.2 9.6-2.5 2.4-4.9 5.6-7.2 9.6-2.3-4-4.7-7.2-7.2-9.6C7.3 9.6 9.7 6.4 12 2.4Z" />
    </svg>
  );
}

export function ClubIcon(props: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      <path d="M12 2.2a4.2 4.2 0 0 0-3.3 6.8A4.2 4.2 0 1 0 7.4 17a4.2 4.2 0 0 0 3.5-1.9l-.8 4.7c-.1.5.2.9.7.9h2.4c.5 0 .8-.4.7-.9l-.8-4.7a4.2 4.2 0 0 0 3.5 1.9 4.2 4.2 0 1 0-1.3-8 4.2 4.2 0 0 0-3.3-6.8Z" />
    </svg>
  );
}

/** Suit key (`s`, `h`, `d`, `c`) → its icon. */
export const SUIT_ICONS = {
  s: SpadeIcon,
  h: HeartIcon,
  d: DiamondIcon,
  c: ClubIcon,
} as const;

// ---------------------------------------------------------------------------
// The mark. A chip with a spade cut out of it — the two things the app is
// about, in one shape that still reads at favicon size.
// ---------------------------------------------------------------------------

export function LogoMark(props: IconProps) {
  return (
    <svg
      viewBox="0 0 32 32"
      width="1em"
      height="1em"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      <circle cx="16" cy="16" r="15" fill="var(--felt-deep)" />
      <circle
        cx="16"
        cy="16"
        r="15"
        fill="none"
        stroke="var(--gold)"
        strokeWidth="1.6"
      />
      {/* The chip's edge spots, at the four quarters. */}
      {[0, 90, 180, 270].map((angle) => (
        <rect
          key={angle}
          x="14.4"
          y="0.9"
          width="3.2"
          height="4.6"
          rx="1.2"
          fill="var(--gold)"
          transform={`rotate(${angle} 16 16)`}
        />
      ))}
      <circle
        cx="16"
        cy="16"
        r="10.4"
        fill="none"
        stroke="var(--gold)"
        strokeWidth="0.9"
        opacity="0.55"
      />
      <path
        d="M16 7.6 10.9 12.6a3.9 3.9 0 0 0 1.6 6.7 3.4 3.4 0 0 0 2.4-.4l-.7 3.1c0 .4.2.7.5.7h2.6c.4 0 .6-.3.5-.7l-.7-3.1a3.4 3.4 0 0 0 2.4.4 3.9 3.9 0 0 0 1.6-6.7Z"
        fill="var(--gold)"
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Verdicts. Three shapes, not three colours: the outcome survives greyscale.
// ---------------------------------------------------------------------------

/** Correct. */
export function CheckIcon(props: IconProps) {
  return (
    <Icon strokeWidth={2.5} {...props}>
      <path d="m5 12.8 4.5 4.4L19 6.6" />
    </Icon>
  );
}

/** A mixed spot: two lines, both playable. */
export function SplitIcon(props: IconProps) {
  return (
    <Icon strokeWidth={2.2} {...props}>
      <path d="M4 18h3.5L12 6h3.5" />
      <path d="M4 6h3.5L12 18h3.5" />
      <path d="M17.5 3.5 21 6l-3.5 2.5" />
      <path d="M17.5 15.5 21 18l-3.5 2.5" />
    </Icon>
  );
}

/** Not the chart action. */
export function CrossIcon(props: IconProps) {
  return (
    <Icon strokeWidth={2.5} {...props}>
      <path d="M6.5 6.5 17.5 17.5M17.5 6.5 6.5 17.5" />
    </Icon>
  );
}

// ---------------------------------------------------------------------------
// Navigation and chrome.
// ---------------------------------------------------------------------------

export function GridIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3.5" y="3.5" width="17" height="17" rx="2.5" />
      <path d="M9.2 3.5v17M14.8 3.5v17M3.5 9.2h17M3.5 14.8h17" />
    </Icon>
  );
}

export function HistoryIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3.6 12a8.4 8.4 0 1 0 2.6-6.1" />
      <path d="M3.4 4.6v4.2h4.2" />
      <path d="M12 7.6V12l3 1.8" />
    </Icon>
  );
}

export function TargetIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="8.4" />
      <circle cx="12" cy="12" r="4.2" />
      <circle cx="12" cy="12" r="0.8" fill="currentColor" stroke="none" />
    </Icon>
  );
}

export function FlameIcon(props: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      <path d="M13.1 2.2c.4 3-1 4.6-2.6 6.1C8.7 10 6.8 11.7 6.8 14.6a5.7 5.7 0 0 0 11.4.3c0-2-.7-3.4-1.6-4.6-.3 1-1 1.7-1.8 2 .5-2.6-.2-5.5-1.7-7.1Z" />
    </svg>
  );
}

export function ArrowRightIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4.5 12h14" />
      <path d="m13 6.5 5.5 5.5L13 17.5" />
    </Icon>
  );
}

export function ChevronLeftIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M14.5 5.5 8 12l6.5 6.5" />
    </Icon>
  );
}

export function ReplayIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M20.4 12a8.4 8.4 0 1 1-2.6-6.1" />
      <path d="M20.6 4.6v4.2h-4.2" />
    </Icon>
  );
}
