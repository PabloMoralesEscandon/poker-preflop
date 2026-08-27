import type { CSSProperties } from 'react';

import { Card, CardBack } from './Card';
import { Chip, ChipStack, DealerButton, type ChipTone } from './Chip';
import { cn } from '../lib/cn';

/**
 * The table.
 *
 * Every drill puts its spot on the same felt: seats around the rim, the dealer
 * button on whoever has it, the blinds posted, the raiser's chips out in front,
 * the pot in the middle, and hero's two cards face up in front of hero — who
 * always sits at the bottom, because that is where a player sits.
 *
 * It is drill-agnostic by construction. It is handed a list of seats and draws
 * them; it never looks at a prompt, never decides who folded, and never
 * computes an amount. Every number it shows arrives pre-formatted from the
 * drill that owns it, which got it from the server. The blind discs are the one
 * thing drawn without a number, and deliberately: the contract never sends what
 * the blinds are, so the chips say *who posted* and the pot says *how much*.
 *
 * ## What is drawn versus what is said
 *
 * The felt is a picture, and a picture is not an interface on its own. So the
 * same facts are carried twice: each seat is a real list item with its position
 * in text, its state in a visible caption *and* in `data-seat`, and every chip
 * that means something carries an accessible name. Read with the stylesheet
 * off, the table degrades into an ordered list of seats — which is what it is.
 *
 * ## Where the seats go
 *
 * Hero is pinned to the bottom of the ring and the rest follow in seat order,
 * running clockwise. That is the direction the action moves at a real table, so
 * "who is behind me" is the same question on screen as it is in the chair.
 */

export interface SeatBet {
  /** Pre-formatted, e.g. `2.5bb`. Never derived here. */
  amount: string;
  /** What the chips are, for the accessible name: `raise`, `limp`. */
  label: string;
  tone?: ChipTone;
}

export interface TableSeat {
  position: string;
  /**
   * The `data-seat` value, verbatim. Drill-chosen vocabulary — the table has
   * no opinion about which states exist, only about how each tone is drawn.
   */
  state: string;
  /** How the seat is drawn. */
  tone: 'hero' | 'live' | 'folded' | 'aggressor';
  /** Short caption on the seat plate: `you`, `folded`, `raised`. */
  caption?: string;
  /**
   * A posted blind. Shown as a labelled disc with no amount — see above.
   * Explicitly nullable so a drill can write `posted: seatIsBlind(...)` rather
   * than having to build the seat object two different ways.
   */
  posted?: 'SB' | 'BB' | undefined;
  /** Chips this seat has voluntarily put in. */
  bet?: SeatBet;
  /** Face-up cards. In these drills only hero ever has any. */
  cards?: readonly string[];
  /** Draw two face-down cards — this seat had a hand and folded it. */
  mucked?: boolean;
}

export interface PokerTableProps {
  seats: readonly TableSeat[];
  /** Who holds the dealer button, if this spot has one on screen. */
  buttonSeat?: string | null;
  /** Pre-formatted pot, e.g. `4bb`. */
  pot?: string | null;
  /** Quiet text across the middle of the felt: the format and stack depth. */
  caption?: string;
  /** Accessible name of the seat list. */
  label?: string;
  className?: string;
}

/** Ring geometry, in percentages of the table box. */
const RING_X = 41;
const RING_Y = 34;
/** Bets sit between their seat and the middle, inside the betting line. */
const BET_SCALE = 0.62;
/**
 * Hero's chips step sideways, because hero is the one seat with cards face up
 * in front of it and chips underneath two cards are chips nobody can see.
 */
const HERO_BET_OFFSET_X = -13;

type Anchor = 'bottom' | 'middle' | 'top';

interface Placed {
  seat: TableSeat;
  /** Percent from the left / top of the table box. */
  x: number;
  y: number;
  betX: number;
  betY: number;
  anchor: Anchor;
  /** Which side of the ring the seat is on, so cards fan towards the middle. */
  side: 'left' | 'right';
}

function place(seats: readonly TableSeat[]): Placed[] {
  const count = seats.length;
  const heroIndex = Math.max(
    seats.findIndex((seat) => seat.tone === 'hero'),
    0
  );

  return seats.map((seat, index) => {
    // Hero to the bottom, everyone else clockwise from there in seat order.
    const step = ((index - heroIndex + count) % count) / count;
    const angle = step * 2 * Math.PI;
    const sin = Math.sin(angle);
    const cos = Math.cos(angle);
    const dealt = (seat.cards?.length ?? 0) > 0;
    return {
      seat,
      x: 50 - RING_X * sin,
      y: 50 + RING_Y * cos,
      betX: 50 - RING_X * BET_SCALE * sin + (dealt ? HERO_BET_OFFSET_X : 0),
      betY: 50 + RING_Y * BET_SCALE * cos,
      // Seats grow their cards towards the middle of the table, so the plate
      // stays on the rim wherever the seat is.
      anchor: cos > 0.3 ? 'bottom' : cos < -0.3 ? 'top' : 'middle',
      side: sin > 0 ? 'left' : 'right',
    };
  });
}

const ANCHOR_TRANSFORM: Record<Anchor, string> = {
  bottom: 'translate(-50%, -100%)',
  middle: 'translate(-50%, -50%)',
  top: 'translate(-50%, 0)',
};

const TONE_INK: Record<TableSeat['tone'], string> = {
  hero: 'text-[#241b02]',
  live: 'text-felt-fg',
  folded: 'text-felt-fg-muted',
  aggressor: 'text-felt-fg',
};

/** Plate backgrounds. The felt is a fixed surface, so these are literal. */
const TONE_STYLE: Record<TableSeat['tone'], CSSProperties> = {
  hero: {
    background: 'linear-gradient(180deg, var(--gold), var(--gold-deep))',
    boxShadow:
      '0 0 0 1px var(--gold-deep), 0 0 20px -2px color-mix(in srgb, var(--gold) 65%, transparent), 0 2px 6px oklch(0% 0 0 / 0.45)',
  },
  live: {
    background:
      'linear-gradient(180deg, oklch(0% 0 0 / 0.45), oklch(0% 0 0 / 0.62))',
    boxShadow:
      '0 0 0 1px oklch(100% 0 0 / 0.24), 0 2px 5px oklch(0% 0 0 / 0.35)',
  },
  aggressor: {
    background:
      'linear-gradient(180deg, color-mix(in srgb, var(--viz-series-2) 80%, black), color-mix(in srgb, var(--viz-series-2) 55%, black))',
    boxShadow:
      '0 0 0 1.5px color-mix(in srgb, var(--viz-series-2) 90%, white), 0 2px 8px oklch(0% 0 0 / 0.5)',
  },
  folded: {
    background: 'oklch(0% 0 0 / 0.32)',
    boxShadow: 'inset 0 0 0 1px oklch(100% 0 0 / 0.1)',
  },
};

const POSTED_TONE: Record<'SB' | 'BB', ChipTone> = {
  SB: 'blue',
  BB: 'green',
};

const POSTED_NAME: Record<'SB' | 'BB', string> = {
  SB: 'small blind posted',
  BB: 'big blind posted',
};

export function PokerTable({
  seats,
  buttonSeat = null,
  pot = null,
  caption,
  label = 'Table positions',
  className,
}: PokerTableProps) {
  const placed = place(seats);

  return (
    <div
      className={cn(
        'relative w-full',
        // Tall enough on a phone that eight seats do not collide, wider and
        // flatter once there is room — the shape of an actual table.
        'aspect-[6/5] sm:aspect-[16/9] lg:aspect-[21/10]',
        className
      )}
    >
      {/* The rail: the padded edge the felt is set into. */}
      <div
        aria-hidden="true"
        className="absolute inset-x-[2%] inset-y-[6%] rounded-[50%]"
        style={{
          background:
            'linear-gradient(180deg, var(--rail-hi), var(--rail) 55%, oklch(15% 0.02 40))',
          boxShadow: 'var(--shadow-table)',
        }}
      />

      {/* The felt, lit from above the way a table under a lamp is. */}
      <div
        aria-hidden="true"
        className="absolute inset-x-[5%] inset-y-[11%] overflow-hidden rounded-[50%]"
        style={{
          background:
            'radial-gradient(ellipse 70% 80% at 50% 22%, var(--felt-lit), var(--felt) 55%, var(--felt-deep) 100%)',
          boxShadow:
            'inset 0 2px 10px oklch(0% 0 0 / 0.5), inset 0 -6px 22px oklch(0% 0 0 / 0.35)',
        }}
      >
        {/* The betting line stitched into the felt. */}
        <div
          className="absolute inset-[8%] rounded-[50%]"
          style={{
            border:
              '1px solid color-mix(in srgb, var(--felt-line) 35%, transparent)',
          }}
        />
        {caption ? (
          <span
            className="font-display absolute inset-x-0 top-[60%] text-center text-[clamp(0.55rem,1.5vw,0.85rem)] tracking-[0.35em]"
            style={{
              color: 'color-mix(in srgb, var(--felt-line) 60%, transparent)',
            }}
          >
            {caption}
          </span>
        ) : null}
      </div>

      {/* The pot, in the dead middle. Every bet is placed on a ring outside it,
          so nothing lands on top of the number that matters most. */}
      {pot ? (
        <div className="absolute top-[48%] left-1/2 -translate-x-1/2 -translate-y-1/2">
          <ChipStack amount={pot} label="pot" tone="black" size="md" />
        </div>
      ) : null}

      {/* What each seat has already put in, out in front of them. */}
      {placed.map(({ seat, betX, betY }) =>
        seat.bet || seat.posted ? (
          <div
            key={`bet-${seat.position}`}
            className="absolute flex -translate-x-1/2 -translate-y-1/2 items-center gap-1"
            style={{ left: `${betX}%`, top: `${betY}%` }}
          >
            {seat.posted ? (
              <Chip
                tone={POSTED_TONE[seat.posted]}
                size="sm"
                label={seat.posted}
                title={`${seat.position} ${POSTED_NAME[seat.posted]}`}
              />
            ) : null}
            {seat.bet ? (
              <ChipStack
                amount={seat.bet.amount}
                label={`${seat.position} ${seat.bet.label}`}
                tone={seat.bet.tone ?? 'red'}
              />
            ) : null}
          </div>
        ) : null
      )}

      <ol aria-label={label} className="absolute inset-0">
        {placed.map(({ seat, x, y, anchor, side }) => {
          const hand =
            seat.cards && seat.cards.length > 0 ? (
              <TableCards cards={seat.cards} />
            ) : seat.mucked ? (
              <MuckedCards />
            ) : null;

          return (
            <li
              key={seat.position}
              data-position={seat.position}
              data-seat={seat.state}
              className={cn(
                'absolute flex items-center gap-1',
                // On the ends of the table there is no room above or below, so
                // the hand sits beside the plate — always on the inside, where
                // the middle of the table is.
                anchor === 'middle'
                  ? side === 'left'
                    ? 'flex-row-reverse'
                    : 'flex-row'
                  : 'flex-col'
              )}
              style={{
                left: `${x}%`,
                top: `${y}%`,
                transform: ANCHOR_TRANSFORM[anchor],
              }}
            >
              {anchor === 'bottom' || anchor === 'middle' ? hand : null}

              <div className="relative flex items-center gap-1">
                <span
                  className={cn(
                    'relative rounded-md px-2 py-1 text-center font-mono text-[0.6875rem] leading-none font-semibold tracking-tight',
                    TONE_INK[seat.tone],
                    seat.tone === 'folded' && 'line-through decoration-1'
                  )}
                  style={TONE_STYLE[seat.tone]}
                >
                  {seat.position}
                  {seat.caption ? (
                    <span
                      className={cn(
                        'mt-0.5 block font-sans text-[0.5rem] font-medium tracking-wide uppercase no-underline',
                        seat.tone === 'hero' ? 'opacity-85' : 'opacity-80'
                      )}
                    >
                      {seat.caption}
                    </span>
                  ) : null}
                </span>

                {buttonSeat === seat.position ? (
                  <DealerButton size="sm" className="-ml-0.5" />
                ) : null}
              </div>

              {anchor === 'top' ? hand : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/**
 * Hero's hand, fanned the way two cards land when they are squeezed.
 *
 * Four PLO cards spread across the same arc instead: even tilt steps and no
 * lifted first card, so DOM order stacks each card over the one before it and
 * every rank stays readable.
 */
function TableCards({ cards }: { cards: readonly string[] }) {
  return (
    <span className="flex items-end -space-x-2.5">
      {cards.map((card, index) => {
        const middle = (cards.length - 1) / 2;
        const isPair = cards.length === 2;
        return (
          <Card
            key={`${card}-${index}`}
            card={card}
            size="md"
            tilt={isPair ? (index === 0 ? -8 : 7) : (index - middle) * 6}
            {...(isPair && index === 0 ? { className: 'z-10' } : {})}
          />
        );
      })}
    </span>
  );
}

function MuckedCards() {
  return (
    <span
      aria-hidden="true"
      data-mucked="true"
      className="flex items-end -space-x-1.5 opacity-70"
    >
      <CardBack size="xs" tilt={-6} />
      <CardBack size="xs" tilt={5} />
    </span>
  );
}

/**
 * The key to the felt, sitting under the table.
 *
 * The discs on the table say who posted and who has the button; this says what
 * the discs are, once, so the felt itself never needs a legend printed on it.
 */
export function TableLegend({
  dealer = true,
  className,
}: {
  /** Off where no button is on the felt — blind versus blind is heads-up. */
  dealer?: boolean;
  className?: string;
}) {
  return (
    <ul
      className={cn(
        'text-fg-muted flex flex-wrap items-center gap-x-4 gap-y-2 text-[0.6875rem]',
        className
      )}
    >
      {dealer ? (
        <li className="flex items-center gap-1.5">
          <DealerButton size="sm" />
          dealer
        </li>
      ) : null}
      <li className="flex items-center gap-1.5">
        <Chip tone="blue" size="sm" label="SB" />
        small blind
      </li>
      <li className="flex items-center gap-1.5">
        <Chip tone="green" size="sm" label="BB" />
        big blind
      </li>
      <li className="flex items-center gap-1.5">
        <span
          aria-hidden="true"
          className="inline-block size-3 rounded-sm"
          style={{
            background:
              'linear-gradient(180deg, var(--gold), var(--gold-deep))',
          }}
        />
        you
      </li>
    </ul>
  );
}
