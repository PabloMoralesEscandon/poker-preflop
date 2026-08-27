import {
  POSITIONS_BY_FORMAT,
  type Position,
  type Vs3BetPrompt as Vs3BetPromptData,
} from '../../api';
import { ActionBar } from '../../components/ActionBar';
import {
  PokerTable,
  TableLegend,
  type TableSeat,
} from '../../components/PokerTable';
import {
  HandLabel,
  SpotFooter,
  SpotFrame,
  SpotHeader,
  SpotNarrative,
  SpotStats,
} from '../../components/Spot';
import { formatBb } from '../../lib/bb';
import { positionName } from '../../lib/positions';
import type { DrillPromptProps } from '../registry';

/**
 * Facing a 3-bet. The first spot in this app where hero is not deciding whether
 * to enter a pot but what to do with one they already opened.
 *
 * That inversion is the thing the screen has to carry, and it shows up in two
 * places a player will otherwise misread:
 *
 *  - **Hero has chips on the felt too.** Every earlier spot draws exactly one
 *    bet, the opponent's. Here hero's own open sits in front of hero's seat,
 *    because it is the reason the price is what it is.
 *  - **The price is not the 3-bet.** Calling costs the 3-bet *less* hero's
 *    open, and those two numbers differ by enough (7bb versus 10bb in the
 *    lightest spot) that showing only the raise would teach the wrong pot
 *    odds. `to_call_bb` arrives computed from the server, like everywhere
 *    else, and is rendered beside the pot rather than left to be worked out.
 *
 * `folded` is not `folded_before`. By the time the action returns to hero,
 * every seat behind the 3-bettor has folded as well, so the list covers seats
 * on both sides of hero and the pot is heads-up.
 */

function seatOrder(prompt: Vs3BetPromptData): readonly Position[] {
  return (
    POSITIONS_BY_FORMAT[prompt.table_format] ?? [
      prompt.hero_position,
      ...prompt.folded,
      prompt.three_bettor_position,
    ]
  );
}

/** Whether hero acts after the 3-bettor once the flop comes. */
function inPosition(prompt: Vs3BetPromptData): boolean {
  const order = seatOrder(prompt);
  const hero = order.indexOf(prompt.hero_position);
  const villain = order.indexOf(prompt.three_bettor_position);
  if (hero < 0 || villain < 0) return false;
  // The 3-bettor always acts after hero preflop, so hero is only in position
  // postflop when the 3-bettor is a blind and hero is not.
  if (prompt.hero_position === 'SB' || prompt.hero_position === 'BB') {
    return false;
  }
  return (
    prompt.three_bettor_position === 'SB' ||
    prompt.three_bettor_position === 'BB'
  );
}

function seatsOf(prompt: Vs3BetPromptData): TableSeat[] {
  const folded = new Set<string>(prompt.folded);

  return seatOrder(prompt).map((position) => {
    const posted =
      position === 'SB'
        ? ('SB' as const)
        : position === 'BB'
          ? ('BB' as const)
          : undefined;

    if (position === prompt.hero_position) {
      return {
        position,
        state: 'hero',
        tone: 'hero',
        caption: 'opened',
        cards: prompt.hand.cards,
        posted,
        // Hero's own chips. No other spot in the app draws these, and leaving
        // them off would make the pot look like it arrived from nowhere.
        bet: {
          amount: formatBb(prompt.open_size_bb),
          label: 'open',
          // Plain chips: red is the 3-bettor's, and hero's open is the thing
          // being answered, not the aggression.
          tone: 'white',
        },
      };
    }
    if (position === prompt.three_bettor_position) {
      return {
        position,
        state: '3bettor',
        tone: 'aggressor',
        caption: '3-bet',
        posted,
        bet: {
          amount: formatBb(prompt.facing_size_bb),
          label: '3-bet',
          tone: 'red',
        },
      };
    }
    return {
      position,
      state: folded.has(position) ? 'folded' : 'to-act',
      tone: folded.has(position) ? 'folded' : 'live',
      caption: folded.has(position) ? 'folded' : 'to act',
      mucked: folded.has(position),
      posted,
    };
  });
}

export function Vs3BetPrompt({
  prompt,
  actions,
  onAction,
  disabled = false,
  shortcuts = [],
}: DrillPromptProps<Vs3BetPromptData>) {
  const seats = seatsOf(prompt);
  const hasButton = seats.some((seat) => seat.position === 'BTN');

  return (
    <section className="space-y-4">
      <SpotFrame>
        <SpotHeader
          seatName={positionName(prompt.hero_position)}
          seatId={prompt.hero_position}
          meta={`${prompt.table_format} · ${prompt.stack_bb}bb · ${
            inPosition(prompt) ? 'in position' : 'out of position'
          }`}
        />

        <div className="space-y-4 px-4 py-4 sm:px-5">
          {/*
            Two clauses, in the order they happened: hero's open first, then
            the 3-bet answering it. Facing a 3-bet is not a warning state — red
            is spent on the 3-bettor's seat, where it identifies rather than
            judges, exactly as the facing-a-raise prompt spends it.
          */}
          <SpotNarrative>
            You opened to{' '}
            <span className="text-fg font-semibold">
              {formatBb(prompt.open_size_bb)}
            </span>
            .{' '}
            <span className="text-fg font-semibold">
              {positionName(prompt.three_bettor_position)}
            </span>{' '}
            <span className="text-fg-muted font-mono">
              ({prompt.three_bettor_position})
            </span>{' '}
            3-bet to{' '}
            <span className="text-fg font-semibold">
              {formatBb(prompt.facing_size_bb)}
            </span>
            .
          </SpotNarrative>

          <PokerTable
            seats={seats}
            buttonSeat={hasButton ? 'BTN' : null}
            pot={formatBb(prompt.pot_bb)}
            caption="FACING A 3-BET"
          />

          <TableLegend />
        </div>

        <SpotFooter>
          <HandLabel notation={prompt.hand.notation} />
          <SpotStats
            items={[
              { term: 'Pot', value: formatBb(prompt.pot_bb) },
              { term: 'To call', value: formatBb(prompt.to_call_bb) },
            ]}
          />
        </SpotFooter>
      </SpotFrame>

      <ActionBar
        actions={actions}
        onAction={onAction}
        disabled={disabled}
        shortcuts={shortcuts}
      />
    </section>
  );
}
