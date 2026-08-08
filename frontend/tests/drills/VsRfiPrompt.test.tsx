import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import nextVsRfi from '@fixtures/next_question_vs_rfi.json';

import type {
  ActionOption,
  NextResponse,
  VsRfiPrompt as VsRfiPromptData,
} from '@/api';
import { assignShortcuts } from '@/lib/shortcuts';
import { VsRfiPrompt } from '@/drills/vs_rfi/VsRfiPrompt';

const FIXTURE = (nextVsRfi as unknown as NextResponse & { done: false })
  .question;
const PROMPT = FIXTURE.prompt as VsRfiPromptData;

/** The two-action matchup: in position against an early open, no calls. */
const THREE_BET_ONLY: ActionOption[] = [
  { id: 'fold', label: 'Fold' },
  { id: '3bet', label: '3-Bet to 3.5bb' },
];

function renderPrompt(
  overrides: Partial<VsRfiPromptData> = {},
  actions: ActionOption[] = FIXTURE.actions
) {
  const onAction = vi.fn();
  render(
    <VsRfiPrompt
      prompt={{ ...PROMPT, ...overrides }}
      actions={actions}
      onAction={onAction}
      shortcuts={assignShortcuts(actions)}
    />
  );
  return onAction;
}

describe('VsRfiPrompt reads the spot', () => {
  it('names hero and their seat', () => {
    renderPrompt();
    const heading = screen.getByRole('heading', { level: 2 });
    expect(heading).toHaveTextContent('Big blind');
    expect(heading).toHaveTextContent('BB');
  });

  it('says who raised, from where, and for how much', () => {
    renderPrompt();
    const line = screen.getByText(/raised to/);
    expect(line).toHaveTextContent('Button');
    expect(line).toHaveTextContent('BTN');
    expect(line).toHaveTextContent('2.5bb');
  });

  it('shows the pot and what calling costs, as given', () => {
    renderPrompt();
    const pot = screen.getByText('Pot').nextElementSibling;
    const toCall = screen.getByText('To call').nextElementSibling;
    // Straight from the prompt: 4bb pot, 1.5bb to call — hero already posted
    // the big blind, so it is not the 2.5bb raise size.
    expect(pot).toHaveTextContent('4bb');
    expect(toCall).toHaveTextContent('1.5bb');
  });

  it('never recomputes the pot from the raise size', () => {
    renderPrompt({ pot_bb: 99, to_call_bb: 42 });
    expect(screen.getByText('Pot').nextElementSibling).toHaveTextContent(
      '99bb'
    );
    expect(screen.getByText('To call').nextElementSibling).toHaveTextContent(
      '42bb'
    );
  });

  it('marks the raiser, the folds and hero on the seat strip', () => {
    renderPrompt();
    const seatOf = (position: string) =>
      document
        .querySelector(`[data-position="${position}"]`)
        ?.getAttribute('data-seat');

    expect(seatOf('UTG')).toBe('folded');
    expect(seatOf('HJ')).toBe('folded');
    expect(seatOf('CO')).toBe('folded');
    expect(seatOf('BTN')).toBe('raiser');
    expect(seatOf('SB')).toBe('to-act');
    expect(seatOf('BB')).toBe('hero');
  });

  it('says whether hero will act first after the flop', () => {
    renderPrompt();
    expect(screen.getByText(/out of position/)).toBeInTheDocument();

    renderPrompt({ hero_position: 'BTN', raiser_position: 'UTG' });
    expect(screen.getAllByText(/in position/).length).toBeGreaterThan(0);
  });

  it('shows the hole cards with rank and suit', () => {
    renderPrompt();
    expect(screen.getByRole('img', { name: 'nine of hearts' })).toBeTruthy();
    expect(screen.getByRole('img', { name: 'eight of hearts' })).toBeTruthy();
    expect(screen.getByText('98s')).toBeInTheDocument();
  });
});

describe('VsRfiPrompt actions', () => {
  it('renders three buttons for a matchup that calls and 3-bets', () => {
    renderPrompt();
    expect(
      screen.getAllByRole('button').map((button) => button.textContent)
    ).toEqual(['Foldf', 'Call 2.5bbc', '3-Bet to 4bbb']);
  });

  /** VS-RFI-CALIBRATION §4: some matchups have no calling range at all. */
  it('renders two buttons for a 3-bet-or-fold matchup', () => {
    renderPrompt(
      { hero_position: 'HJ', raiser_position: 'UTG', folded_before: [] },
      THREE_BET_ONLY
    );

    const labels = screen
      .getAllByRole('button')
      .map((button) => button.textContent);
    expect(labels).toHaveLength(2);
    expect(labels[0]).toContain('Fold');
    expect(labels[1]).toContain('3-Bet to 3.5bb');
    expect(
      screen.queryByRole('button', { name: /Call/ })
    ).not.toBeInTheDocument();
  });

  it('renders the server labels verbatim, sizes included', () => {
    renderPrompt();
    expect(
      screen.getByRole('button', { name: /^Call 2\.5bb/ })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /^3-Bet to 4bb/ })
    ).toBeInTheDocument();
  });

  it('emits the action id, not the label', async () => {
    const onAction = renderPrompt();
    await userEvent.click(screen.getByRole('button', { name: /^3-Bet/ }));
    expect(onAction).toHaveBeenCalledExactlyOnceWith('3bet');
  });

  it('disables every button while an answer is in flight', () => {
    render(
      <VsRfiPrompt
        prompt={PROMPT}
        actions={FIXTURE.actions}
        onAction={vi.fn()}
        disabled
      />
    );
    for (const button of screen.getAllByRole('button')) {
      expect(button).toBeDisabled();
    }
  });
});

/**
 * FE-11 asks specifically whether `3bet` collides. It does not: the existing
 * derivation skips the leading digit and takes the first free letter.
 */
describe('keyboard bindings come from the existing derivation', () => {
  it('gives call and 3bet distinct keys, with no change to the rule', () => {
    const keys = assignShortcuts(FIXTURE.actions);
    expect(keys).toEqual([
      { actionId: 'fold', key: 'f', label: 'Fold' },
      { actionId: 'call', key: 'c', label: 'Call 2.5bb' },
      { actionId: '3bet', key: 'b', label: '3-Bet to 4bb' },
    ]);
    expect(new Set(keys.map((k) => k.key)).size).toBe(3);
  });

  it('binds a two-action matchup too', () => {
    expect(assignShortcuts(THREE_BET_ONLY).map((k) => k.key)).toEqual([
      'f',
      'b',
    ]);
  });

  it('shows each binding on its button', () => {
    renderPrompt();
    expect(
      screen.getByRole('button', { name: '3-Bet to 4bb (key b)' })
    ).toHaveAttribute('data-shortcut', 'b');
    expect(
      screen.getByRole('button', { name: 'Call 2.5bb (key c)' })
    ).toHaveAttribute('data-shortcut', 'c');
  });
});
