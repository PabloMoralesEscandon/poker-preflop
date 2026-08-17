import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { PokerTable, type TableSeat } from '@/components/PokerTable';

/**
 * The felt is a picture, and a picture that only works as a picture is not an
 * interface. These tests pin the half that is not decoration: the seats are a
 * real ordered list, every state is readable without colour, and no number
 * appears on the table that the drill did not hand over.
 */

const SEATS: TableSeat[] = [
  {
    position: 'UTG',
    state: 'folded',
    tone: 'folded',
    caption: 'folded',
    mucked: true,
  },
  {
    position: 'CO',
    state: 'raiser',
    tone: 'aggressor',
    caption: 'raised',
    bet: { amount: '2.5bb', label: 'raise' },
  },
  { position: 'BTN', state: 'to-act', tone: 'live', caption: 'to act' },
  {
    position: 'SB',
    state: 'to-act',
    tone: 'live',
    caption: 'to act',
    posted: 'SB',
  },
  {
    position: 'BB',
    state: 'hero',
    tone: 'hero',
    caption: 'you',
    posted: 'BB',
    cards: ['Ah', 'Ks'],
  },
];

function renderTable(props: Partial<Parameters<typeof PokerTable>[0]> = {}) {
  return render(
    <PokerTable seats={SEATS} buttonSeat="BTN" pot="4bb" {...props} />
  );
}

describe('the table is a list of seats before it is a picture', () => {
  it('renders every seat in the order it was given', () => {
    renderTable();
    const seats = within(screen.getByLabelText('Table positions'))
      .getAllByRole('listitem')
      .map((seat) => seat.getAttribute('data-position'));
    expect(seats).toEqual(['UTG', 'CO', 'BTN', 'SB', 'BB']);
  });

  it('passes each drill-chosen state through to data-seat verbatim', () => {
    renderTable();
    const stateOf = (position: string) =>
      document
        .querySelector(`[data-position="${position}"]`)
        ?.getAttribute('data-seat');

    expect(stateOf('UTG')).toBe('folded');
    expect(stateOf('CO')).toBe('raiser');
    expect(stateOf('BB')).toBe('hero');
  });

  it('says what each seat did in words, not only in colour', () => {
    renderTable();
    const seat = (position: string) =>
      document.querySelector(`[data-position="${position}"]`);

    expect(seat('UTG')).toHaveTextContent('folded');
    expect(seat('CO')).toHaveTextContent('raised');
    expect(seat('BB')).toHaveTextContent('you');
  });
});

describe('the discs on the felt are named', () => {
  it('marks the button seat with a dealer button', () => {
    renderTable();
    const button = screen.getByRole('img', { name: 'dealer button' });
    expect(button.closest('[data-position]')).toHaveAttribute(
      'data-position',
      'BTN'
    );
  });

  it('draws no dealer button when no seat has one', () => {
    renderTable({ buttonSeat: null });
    expect(
      screen.queryByRole('img', { name: 'dealer button' })
    ).not.toBeInTheDocument();
  });

  it('names the posted blinds by seat', () => {
    renderTable();
    expect(
      screen.getByRole('img', { name: 'SB small blind posted' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: 'BB big blind posted' })
    ).toBeInTheDocument();
  });

  /**
   * The contract never sends the blind amounts, so the blind discs must not
   * invent them. The only figures on the felt are the ones handed in.
   */
  it('puts no amount on a blind it was never given', () => {
    renderTable({ pot: null, seats: [SEATS[3]!, SEATS[4]!] });
    expect(document.body.textContent).not.toMatch(/bb/);
  });

  it('shows the pot and each bet with the amount it was handed', () => {
    renderTable();
    expect(screen.getByRole('img', { name: 'pot 4bb' })).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: 'CO raise 2.5bb' })
    ).toBeInTheDocument();
  });
});

describe('the cards on the table', () => {
  it('deals hero their two cards face up, readable by rank and suit', () => {
    renderTable();
    expect(screen.getByRole('img', { name: 'ace of hearts' })).toBeTruthy();
    expect(screen.getByRole('img', { name: 'king of spades' })).toBeTruthy();
    expect(
      document
        .querySelector('[data-card="Ah"]')
        ?.closest('[data-position]')
        ?.getAttribute('data-position')
    ).toBe('BB');
  });

  it('gives a folded seat face-down cards rather than an empty chair', () => {
    renderTable();
    const utg = document.querySelector('[data-position="UTG"]') as HTMLElement;
    expect(utg.querySelector('[data-mucked]')).toBeInTheDocument();
    // Decorative: the caption already says "folded", and nobody knows what the
    // cards were, so they must not be announced as cards.
    expect(within(utg).queryAllByRole('img', { name: / of / })).toHaveLength(0);
  });

  it('shows no cards at all for a seat that is still to act', () => {
    renderTable();
    const btn = document.querySelector('[data-position="BTN"]') as HTMLElement;
    expect(btn.querySelector('[data-card]')).toBeNull();
    expect(btn.querySelector('[data-mucked]')).toBeNull();
  });
});
