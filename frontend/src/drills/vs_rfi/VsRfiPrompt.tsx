import {
  POSITIONS_BY_FORMAT,
  type Position,
  type VsRfiPrompt as VsRfiPromptData,
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
 * Facing a single raise. The spot has to read in one glance: who raised, from
 * where, for how much, what the pot is now, and what continuing costs.
 *
 * On the felt that is four things at once — the raiser's seat is the loud one,
 * their chips are out in front of it with the size on them, the pot sits in
 * the middle, and hero is lit at the bottom. The sentence above the table says
 * the same thing in words, because a picture of chips is not a price.
 *
 * `pot_bb` and `to_call_bb` arrive computed from the server. This component
 * never derives them — hero has already posted a blind in most of these spots,
 * so what they still owe is not the raise size, and that arithmetic is exactly
 * the kind the contract keeps on one side of the wire.
 */

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

function seatsOf(prompt: VsRfiPromptData): TableSeat[] {
  const folded = new Set(prompt.folded_before);

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
        caption: 'you',
        cards: prompt.hand.cards,
        posted,
      };
    }
    if (position === prompt.raiser_position) {
      return {
        position,
        state: 'raiser',
        tone: 'aggressor',
        caption: 'raised',
        posted,
        // The one number on the felt that is not the pot, and it is the
        // server's: the size hero is actually facing.
        bet: {
          amount: formatBb(prompt.facing_size_bb),
          label: 'raise',
          tone: 'red',
        },
      };
    }
    if (folded.has(position)) {
      return {
        position,
        state: 'folded',
        tone: 'folded',
        caption: 'folded',
        mucked: true,
        posted,
      };
    }
    return {
      position,
      state: 'to-act',
      tone: 'live',
      caption: 'to act',
      posted,
    };
  });
}

export function VsRfiPrompt({
  prompt,
  actions,
  onAction,
  disabled = false,
  shortcuts = [],
}: DrillPromptProps<VsRfiPromptData>) {
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
            No tint on this one. Facing a raise is the normal state of this
            drill, not a warning, and red already means "not the chart action"
            two panels down — spending it here would make the two say the same
            thing about different subjects. The raiser's own seat carries the
            colour instead, where it identifies rather than judges.
          */}
          <SpotNarrative>
            <span className="text-fg font-semibold">
              {positionName(prompt.raiser_position)}
            </span>{' '}
            <span className="text-fg-muted font-mono">
              ({prompt.raiser_position})
            </span>{' '}
            raised to{' '}
            <span className="text-fg font-semibold">
              {formatBb(prompt.facing_size_bb)}
            </span>
            .
          </SpotNarrative>

          <PokerTable
            seats={seats}
            buttonSeat={hasButton ? 'BTN' : null}
            pot={formatBb(prompt.pot_bb)}
            caption="FACING A RAISE"
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
