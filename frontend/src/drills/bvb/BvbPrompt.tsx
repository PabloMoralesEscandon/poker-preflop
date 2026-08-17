import type { BvbPrompt as BvbPromptData } from '../../api';
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
 * Blind versus blind: the big blind responding to the small blind.
 *
 * The whole drill turns on one fact, so the component is built around making it
 * impossible to miss: **what the small blind did decides which actions are
 * legal.** After a limp hero is already in for free, so folding is irrational
 * and the server does not offer it (RANGE-DATA-FORMAT §9); after a raise it is
 * an ordinary facing-a-raise spot and fold is back.
 *
 * That distinction is carried four ways, none of them colour alone:
 *
 *  - a banner naming the branch in words, with the size it involves;
 *  - the small blind's seat, captioned `limped` or `raised`;
 *  - their chips on the felt, with the size on them;
 *  - the cost line, which says "nothing to call" rather than "0bb".
 *
 * As everywhere else, `actions` is rendered exactly as the server sent it. No
 * fold button is synthesised, no action is reordered, and no sizing is computed
 * here — if fold is absent it is absent, which is the point.
 */

/** What the small blind did, in the words the banner and the seat use. */
function branchCopy(prompt: BvbPromptData): {
  verb: string;
  headline: string;
  consequence: string;
} {
  if (prompt.sb_action === 'limp') {
    return {
      verb: 'limped',
      headline: `${positionName(prompt.vs_position)} limped for ${formatBb(prompt.facing_size_bb)}`,
      // Said plainly, because it is the reason there is no fold button below.
      consequence: 'You are in for free — there is nothing to call.',
    };
  }
  return {
    verb: 'raised',
    headline: `${positionName(prompt.vs_position)} raised to ${formatBb(prompt.facing_size_bb)}`,
    consequence: 'You are facing a raise and must put in chips to continue.',
  };
}

export function BvbPrompt({
  prompt,
  actions,
  onAction,
  disabled = false,
  shortcuts = [],
}: DrillPromptProps<BvbPromptData>) {
  const branch = branchCopy(prompt);
  const limped = prompt.sb_action === 'limp';

  // Heads-up by the time hero acts: two seats, not a ring. Everyone else is
  // long gone, and drawing four empty chairs would only invite the question of
  // what they did.
  const seats: TableSeat[] = [
    {
      position: prompt.vs_position,
      state: prompt.sb_action,
      tone: limped ? 'live' : 'aggressor',
      caption: branch.verb,
      posted: 'SB',
      bet: {
        amount: formatBb(prompt.facing_size_bb),
        label: branch.verb,
        tone: limped ? 'blue' : 'red',
      },
    },
    {
      position: prompt.hero_position,
      state: 'hero',
      tone: 'hero',
      caption: 'you',
      posted: 'BB',
      cards: prompt.hand.cards,
    },
  ];

  return (
    <section className="space-y-4">
      <SpotFrame>
        <SpotHeader
          seatName={positionName(prompt.hero_position)}
          seatId={prompt.hero_position}
          meta={`${prompt.table_format} · ${prompt.stack_bb}bb · blind vs blind`}
        />

        <div className="space-y-4 px-4 py-4 sm:px-5">
          {/*
            The banner. It is the first thing in the panel and it names the
            branch in words, because everything below it — including whether a
            fold button exists — follows from this one line.
          */}
          <SpotNarrative
            tone={limped ? 'good' : 'bad'}
            marker={{ 'data-sb-action': prompt.sb_action }}
          >
            <span className="text-fg font-semibold">{branch.headline}</span>{' '}
            <span className="text-fg-muted">{branch.consequence}</span>
          </SpotNarrative>

          <PokerTable
            seats={seats}
            pot={formatBb(prompt.pot_bb)}
            caption="BLIND VS BLIND"
          />

          <TableLegend dealer={false} />
        </div>

        <SpotFooter>
          <HandLabel notation={prompt.hand.notation} />
          <SpotStats
            items={[
              { term: 'Pot', value: formatBb(prompt.pot_bb) },
              {
                term: 'To call',
                // `to_call_bb` is 0.0 after a limp. "0bb" would read as a
                // missing value; "nothing" is what is actually true.
                value:
                  prompt.to_call_bb === 0
                    ? 'nothing'
                    : formatBb(prompt.to_call_bb),
              },
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
