import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import nextQuestionFixture from '@fixtures/next_question.json';

import type { NextResponse, RfiPrompt as RfiPromptData } from '@/api';
import { RfiPrompt } from '@/drills/rfi/RfiPrompt';

const FIXTURE = (
  nextQuestionFixture as unknown as NextResponse & {
    done: false;
  }
).question;

const PROMPT = FIXTURE.prompt as RfiPromptData;

function renderPrompt(
  overrides: Partial<RfiPromptData> = {},
  actions = FIXTURE.actions
) {
  const onAction = vi.fn();
  render(
    <RfiPrompt
      prompt={{ ...PROMPT, ...overrides }}
      actions={actions}
      onAction={onAction}
    />
  );
  return onAction;
}

describe('RfiPrompt reads the spot', () => {
  it('names the hero position and shows its id', () => {
    renderPrompt();
    const heading = screen.getByRole('heading', { level: 2 });
    expect(heading).toHaveTextContent('Cutoff');
    expect(heading).toHaveTextContent('CO');
  });

  it('shows the table format, stack depth and pot', () => {
    renderPrompt();
    const meta = screen.getByText(/6max/);
    expect(meta).toHaveTextContent('100bb');
    expect(meta).toHaveTextContent('1.5bb in the pot');
  });

  it('says how many players are left to act', () => {
    renderPrompt();
    // CO at 6-max has BTN, SB and BB behind.
    expect(screen.getByText(/3 players left to act/)).toBeInTheDocument();
  });

  it('describes the small blind by its postflop disadvantage', () => {
    renderPrompt({
      hero_position: 'SB',
      folded_before: ['UTG', 'HJ', 'CO', 'BTN'],
    });
    expect(screen.getByText(/first to act after the flop/)).toBeInTheDocument();
  });

  it('marks which seats folded, which is the hero, and which are live', () => {
    renderPrompt();
    const seatOf = (position: string) =>
      document
        .querySelector(`[data-position="${position}"]`)
        ?.getAttribute('data-seat');

    expect(seatOf('UTG')).toBe('folded');
    expect(seatOf('HJ')).toBe('folded');
    expect(seatOf('CO')).toBe('hero');
    expect(seatOf('BTN')).toBe('to-act');
    expect(seatOf('SB')).toBe('to-act');
    expect(seatOf('BB')).toBe('to-act');
  });
});

describe('RfiPrompt hole cards', () => {
  it('renders both cards with rank and suit legible, not just colour', () => {
    renderPrompt();
    expect(screen.getByRole('img', { name: 'ace of hearts' })).toBeTruthy();
    expect(screen.getByRole('img', { name: 'king of spades' })).toBeTruthy();

    const ace = document.querySelector('[data-card="Ah"]');
    expect(ace).toHaveTextContent('A');
    expect(ace).toHaveTextContent('♥');
    expect(ace?.getAttribute('data-suit')).toBe('h');
  });

  it('shows the shorthand notation alongside the cards', () => {
    renderPrompt();
    expect(screen.getByText('AKo')).toBeInTheDocument();
  });

  it('renders every suit with its own glyph and name', () => {
    renderPrompt({
      hand: { cards: ['Td', '2c'], notation: 'T2o' },
    });
    expect(screen.getByRole('img', { name: 'ten of diamonds' })).toBeTruthy();
    expect(screen.getByRole('img', { name: 'two of clubs' })).toBeTruthy();
    expect(document.querySelector('[data-card="Td"]')).toHaveTextContent('♦');
    expect(document.querySelector('[data-card="2c"]')).toHaveTextContent('♣');
  });
});

describe('RfiPrompt actions', () => {
  it('renders the server labels verbatim and never computes a size', async () => {
    const onAction = renderPrompt();

    const raise = screen.getByRole('button', { name: 'Raise 2.5bb' });
    expect(raise).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Fold' })).toBeInTheDocument();

    await userEvent.click(raise);
    expect(onAction).toHaveBeenCalledExactlyOnceWith('raise');
  });

  it('renders three actions at a three-action spot', () => {
    renderPrompt({ hero_position: 'SB' }, [
      { id: 'fold', label: 'Fold' },
      { id: 'raise', label: 'Raise 3bb' },
      { id: 'limp', label: 'Limp 1bb' },
    ]);

    const buttons = screen
      .getAllByRole('button')
      .map((button) => button.textContent);
    expect(buttons).toEqual(['Fold', 'Raise 3bb', 'Limp 1bb']);
  });

  it('emits the action id the server gave, not a label', async () => {
    const onAction = renderPrompt({ hero_position: 'SB' }, [
      { id: 'fold', label: 'Fold' },
      { id: 'limp', label: 'Limp 1bb' },
    ]);
    await userEvent.click(screen.getByRole('button', { name: 'Limp 1bb' }));
    expect(onAction).toHaveBeenCalledExactlyOnceWith('limp');
  });

  it('disables the actions while an answer is in flight', () => {
    render(
      <RfiPrompt
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
