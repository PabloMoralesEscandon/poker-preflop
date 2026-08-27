import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import nextVs3Bet from '@fixtures/next_question_vs_3bet.json';

import type {
  ActionOption,
  NextResponse,
  Vs3BetPrompt as Vs3BetPromptData,
} from '@/api';
import { assignShortcuts } from '@/lib/shortcuts';
import { Vs3BetPrompt } from '@/drills/vs_3bet/Vs3BetPrompt';

const FIXTURE = (nextVs3Bet as unknown as NextResponse & { done: false })
  .question;
const PROMPT = FIXTURE.prompt as Vs3BetPromptData;

/** The matchups whose chart has a shove cell offer a third non-fold button. */
const WITH_SHOVE: ActionOption[] = [
  { id: 'fold', label: 'Fold' },
  { id: 'call', label: 'Call 12bb' },
  { id: '4bet', label: '4-Bet to 27bb' },
  { id: 'allin', label: 'All-in 100bb' },
];

function renderPrompt(
  overrides: Partial<Vs3BetPromptData> = {},
  actions: ActionOption[] = FIXTURE.actions
) {
  const onAction = vi.fn();
  render(
    <Vs3BetPrompt
      prompt={{ ...PROMPT, ...overrides }}
      actions={actions}
      onAction={onAction}
      shortcuts={assignShortcuts(actions)}
    />
  );
  return onAction;
}

describe('Vs3BetPrompt reads the spot', () => {
  it('names hero and their seat', () => {
    renderPrompt();
    const heading = screen.getByRole('heading', { level: 2 });
    expect(heading).toHaveTextContent('UTG');
  });

  it('says what hero opened to, then who 3-bet and for how much', () => {
    renderPrompt();
    const line = screen.getByText(/You opened to/);
    expect(line).toHaveTextContent('3bb');
    expect(line).toHaveTextContent('Button');
    expect(line).toHaveTextContent('BTN');
    expect(line).toHaveTextContent('10bb');
  });

  it('shows the pot and what calling costs, as given', () => {
    renderPrompt();
    const pot = screen.getByText('Pot').nextElementSibling;
    const toCall = screen.getByText('To call').nextElementSibling;
    // Straight from the prompt. To call is 7bb, not the 10bb 3-bet: hero's own
    // 3bb open is already in, and that gap is the whole pot-odds lesson here.
    expect(pot).toHaveTextContent('14.5bb');
    expect(toCall).toHaveTextContent('7bb');
  });

  it('never recomputes the pot or the price from the sizes', () => {
    renderPrompt({ pot_bb: 99, to_call_bb: 42 });
    expect(screen.getByText('Pot').nextElementSibling).toHaveTextContent(
      '99bb'
    );
    expect(screen.getByText('To call').nextElementSibling).toHaveTextContent(
      '42bb'
    );
  });

  it('puts hero on the felt with chips, not just the 3-bettor', () => {
    renderPrompt();
    // Hero opened, so hero has money in front of them. Every earlier spot in
    // this app draws exactly one bet; this one draws two.
    expect(screen.getByRole('img', { name: 'UTG open 3bb' })).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: 'BTN 3-bet 10bb' })
    ).toBeInTheDocument();
  });

  it('folds every seat that is neither hero nor the 3-bettor', () => {
    renderPrompt();
    const table = screen.getByLabelText('Table positions');
    // Six of the eight seats, on both sides of hero — this is not
    // `folded_before`, and a seat behind the 3-bettor is out too.
    expect(within(table).getAllByText('folded')).toHaveLength(6);
    expect(within(table).queryByText('to act')).not.toBeInTheDocument();
  });
});

describe('Vs3BetPrompt renders the server action set verbatim', () => {
  it('offers exactly what it was given, in order', () => {
    renderPrompt();
    const buttons = within(screen.getByRole('group', { name: 'Your action' }))
      .getAllByRole('button')
      .map((button) => button.getAttribute('data-action-id'));
    expect(buttons).toEqual(['fold', 'call', '4bet']);
  });

  it('adds the shove button where the chart has one, and no sizing of its own', () => {
    renderPrompt({}, WITH_SHOVE);
    const group = within(screen.getByRole('group', { name: 'Your action' }));
    expect(
      group.getAllByRole('button').map((b) => b.getAttribute('data-action-id'))
    ).toEqual(['fold', 'call', '4bet', 'allin']);
    // Labels are the server's words, not ours.
    expect(group.getByRole('button', { name: /All-in/ })).toHaveTextContent(
      'All-in 100bb'
    );
  });

  it('emits the chosen action id', async () => {
    const onAction = renderPrompt();
    await userEvent.click(screen.getByRole('button', { name: /4-Bet/ }));
    expect(onAction).toHaveBeenCalledWith('4bet');
  });
});

describe('Vs3BetPrompt reports position honestly', () => {
  it('calls an early opener out of position against a late 3-bet', () => {
    renderPrompt();
    // UTG opened and the button 3-bet: hero acts first on every street.
    expect(screen.getByRole('heading', { level: 2 }).parentElement).toHaveTextContent(
      'out of position'
    );
  });

  it('calls the opener in position when a blind 3-bets', () => {
    renderPrompt({ three_bettor_position: 'BB', folded: ['UTG1', 'LJ', 'HJ', 'CO', 'BTN', 'SB'] });
    expect(screen.getByRole('heading', { level: 2 }).parentElement).toHaveTextContent(
      'in position'
    );
  });
});
