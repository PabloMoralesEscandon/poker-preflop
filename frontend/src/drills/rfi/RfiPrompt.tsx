import type { Position, RfiPrompt as RfiPromptData } from '../../api';
import { POSITIONS_BY_FORMAT } from '../../api';
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
 * The RFI spot: everything a player needs to read the situation at a glance —
 * where they are sitting, what they hold, how deep they are, and who has
 * already folded.
 *
 * It is dealt onto the shared felt, so the question is answered the way it is
 * answered at a table: hero's seat is lit at the bottom, the folded seats have
 * their cards mucked in front of them, the button and the blinds are where
 * they actually are, and the two cards are face up.
 *
 * Action labels come from the server and are rendered verbatim. This component
 * never computes a raise size.
 */

/**
 * The seat order for a format.
 *
 * Falls back to reconstructing the table from the prompt itself if the server
 * sends a format this build has never heard of. Table formats are a wire enum
 * declared in two languages (see RANGE-DATA-FORMAT §intro), so the two services
 * can legitimately disagree for the length of one deploy — and a stale build
 * should degrade to a slightly vaguer table, not a blank screen.
 */
function seatOrder(prompt: RfiPromptData): readonly Position[] {
  return (
    POSITIONS_BY_FORMAT[prompt.table_format] ?? [
      ...prompt.folded_before,
      prompt.hero_position,
    ]
  );
}

/** Where the hero sits relative to the blinds, in plain language. */
function seatDescription(prompt: RfiPromptData): string {
  const { hero_position: hero } = prompt;
  const order = seatOrder(prompt);
  const heroIndex = order.indexOf(hero);
  const toAct = order.length - 1 - heroIndex;

  if (hero === 'SB') return 'first to act after the flop, one player behind';
  if (hero === 'BTN') return 'last to act after the flop';
  if (toAct === 1) return '1 player left to act';
  if (toAct < 1) return 'the pot is unopened';
  return `${toAct} players left to act`;
}

/** The prompt, as a list of seats the table can draw. */
function seatsOf(prompt: RfiPromptData): TableSeat[] {
  const folded = new Set(prompt.folded_before);

  return seatOrder(prompt).map((position) => {
    const isHero = position === prompt.hero_position;
    const hasFolded = folded.has(position);
    const posted =
      position === 'SB'
        ? ('SB' as const)
        : position === 'BB'
          ? ('BB' as const)
          : undefined;

    if (isHero) {
      return {
        position,
        state: 'hero',
        tone: 'hero',
        caption: 'you',
        cards: prompt.hand.cards,
        posted,
      };
    }
    if (hasFolded) {
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

export function RfiPrompt({
  prompt,
  actions,
  onAction,
  disabled = false,
  shortcuts = [],
}: DrillPromptProps<RfiPromptData>) {
  const seats = seatsOf(prompt);
  const hasButton = seats.some((seat) => seat.position === 'BTN');

  return (
    <section className="space-y-4">
      <SpotFrame>
        <SpotHeader
          seatName={positionName(prompt.hero_position)}
          seatId={prompt.hero_position}
          meta={`${prompt.table_format} · ${prompt.stack_bb}bb · ${prompt.pot_bb}bb in the pot`}
        />

        <div className="space-y-4 px-4 py-4 sm:px-5">
          <SpotNarrative>
            {seatDescription(prompt)}. The pot is unopened.
          </SpotNarrative>

          <PokerTable
            seats={seats}
            buttonSeat={hasButton ? 'BTN' : null}
            pot={formatBb(prompt.pot_bb)}
            caption="UNOPENED POT"
          />

          <TableLegend />
        </div>

        <SpotFooter>
          <HandLabel notation={prompt.hand.notation} />
          <SpotStats
            items={[{ term: 'Pot', value: formatBb(prompt.pot_bb) }]}
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
