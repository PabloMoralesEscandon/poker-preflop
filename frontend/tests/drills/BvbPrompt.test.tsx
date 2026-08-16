import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import nextBvbLimp from '@fixtures/next_question_bvb_limp.json';

import type {
  ActionOption,
  BvbPrompt as BvbPromptData,
  NextResponse,
} from '@/api';
import { BvbPrompt } from '@/drills/bvb/BvbPrompt';
import { assignShortcuts } from '@/lib/shortcuts';

const FIXTURE = (nextBvbLimp as unknown as NextResponse & { done: false })
  .question;
const LIMP_PROMPT = FIXTURE.prompt as BvbPromptData;

/** The other branch: an ordinary facing-a-raise spot, where fold is back. */
const RAISE_PROMPT: BvbPromptData = {
  ...LIMP_PROMPT,
  sb_action: 'raise',
  facing_size_bb: 3,
  pot_bb: 4,
  to_call_bb: 2,
};

const RAISE_ACTIONS: ActionOption[] = [
  { id: 'fold', label: 'Fold' },
  { id: 'call', label: 'Call 3bb' },
  { id: '3bet', label: '3-Bet to 10.5bb' },
];

function renderPrompt(
  prompt: BvbPromptData = LIMP_PROMPT,
  actions: ActionOption[] = FIXTURE.actions
) {
  const onAction = vi.fn();
  render(
    <BvbPrompt
      prompt={prompt}
      actions={actions}
      onAction={onAction}
      shortcuts={assignShortcuts(actions)}
    />
  );
  return onAction;
}

const actionGroup = () =>
  within(screen.getByRole('group', { name: 'Your action' }));

describe('BvbPrompt reads the spot', () => {
  it('names hero and their seat', () => {
    renderPrompt();
    const heading = screen.getByRole('heading', { level: 2 });
    expect(heading).toHaveTextContent('Big blind');
    expect(heading).toHaveTextContent('BB');
  });

  it('shows the two blinds and nobody else', () => {
    renderPrompt();
    const seats = within(screen.getByLabelText('Table positions'))
      .getAllByRole('listitem')
      .map((seat) => seat.getAttribute('data-position'));
    expect(seats).toEqual(['SB', 'BB']);
  });

  it('shows the hole cards with rank and suit', () => {
    renderPrompt();
    expect(screen.getByRole('img', { name: 'ten of diamonds' })).toBeTruthy();
    expect(screen.getByRole('img', { name: 'nine of diamonds' })).toBeTruthy();
    expect(screen.getByText('T9s')).toBeInTheDocument();
  });

  it('shows the pot as given, never recomputed', () => {
    renderPrompt();
    expect(screen.getByText('Pot').nextElementSibling).toHaveTextContent('2bb');

    renderPrompt({ ...LIMP_PROMPT, pot_bb: 99 });
    expect(screen.getAllByText('Pot')[1]?.nextElementSibling).toHaveTextContent(
      '99bb'
    );
  });
});

/**
 * The distinction the whole drill turns on. FE-13 asks for it to be
 * unmissable, so it is asserted in each of the three places it is carried —
 * the banner, the seat strip, and the cost line — rather than only once.
 */
describe('what the small blind did', () => {
  it('says the small blind limped, and what that means', () => {
    renderPrompt();
    const banner = document.querySelector('[data-sb-action]');
    expect(banner).toHaveAttribute('data-sb-action', 'limp');
    expect(banner).toHaveTextContent('Small blind limped for 1bb');
    expect(banner).toHaveTextContent('in for free');
  });

  it('says the small blind raised, and what that means', () => {
    renderPrompt(RAISE_PROMPT, RAISE_ACTIONS);
    const banner = document.querySelector('[data-sb-action]');
    expect(banner).toHaveAttribute('data-sb-action', 'raise');
    expect(banner).toHaveTextContent('Small blind raised to 3bb');
    expect(banner).toHaveTextContent('must put in chips');
  });

  it('marks the small blind seat with the branch, for a screen reader too', () => {
    renderPrompt();
    const sb = document.querySelector('[data-position="SB"]');
    expect(sb).toHaveAttribute('data-seat', 'limp');
    expect(sb).toHaveTextContent('limped');

    renderPrompt(RAISE_PROMPT, RAISE_ACTIONS);
    const raised = document.querySelectorAll('[data-position="SB"]')[1];
    expect(raised).toHaveAttribute('data-seat', 'raise');
    expect(raised).toHaveTextContent('raised');
  });

  it('never renders the branch through colour alone', () => {
    // Both branches carry the distinction in words, so the fills are decoration
    // rather than the encoding. Asserted because the colours are the tempting
    // shortcut and the dataviz rule forbids exactly that.
    renderPrompt();
    expect(screen.getByText(/limped for/)).toBeInTheDocument();
    renderPrompt(RAISE_PROMPT, RAISE_ACTIONS);
    expect(screen.getByText(/raised to/)).toBeInTheDocument();
  });
});

/**
 * BVB-CALIBRATION §2 and RANGE-DATA-FORMAT §9: after a limp hero is in for
 * free, so fold is not a legal action and `to_call_bb` is `0.0`. Both facts
 * have their own test because both have an obvious wrong rendering — a fold
 * button that is never right, and the string "0bb".
 */
describe('the limp branch has no fold', () => {
  it('renders exactly the actions the server sent', () => {
    renderPrompt();
    expect(
      actionGroup()
        .getAllByRole('button')
        .map((button) => button.getAttribute('data-action-id'))
    ).toEqual(['check', 'raise']);
  });

  it('adds no fold affordance of its own', () => {
    renderPrompt();
    expect(
      actionGroup().queryByRole('button', { name: /fold/i })
    ).not.toBeInTheDocument();
    expect(document.querySelector('[data-action-id="fold"]')).toBeNull();
  });

  it('binds no key to a fold that does not exist', () => {
    const keys = assignShortcuts(FIXTURE.actions);
    expect(keys).toEqual([
      { actionId: 'check', key: 'c', label: 'Check' },
      { actionId: 'raise', key: 'r', label: 'Raise to 3.5bb' },
    ]);
    expect(keys.map((shortcut) => shortcut.key)).not.toContain('f');
    expect(document.querySelectorAll('[data-shortcut="f"]')).toHaveLength(0);
  });

  it('brings fold back on the raise branch', () => {
    renderPrompt(RAISE_PROMPT, RAISE_ACTIONS);
    expect(
      actionGroup()
        .getAllByRole('button')
        .map((button) => button.getAttribute('data-action-id'))
    ).toEqual(['fold', 'call', '3bet']);
    expect(assignShortcuts(RAISE_ACTIONS).map((s) => s.key)).toEqual([
      'f',
      'c',
      'b',
    ]);
  });
});

describe('check is an action with no chips', () => {
  it('never renders a zero cost as "0bb"', () => {
    renderPrompt();
    // A standalone zero, not the "0bb" inside "100bb".
    expect(document.body.textContent).not.toMatch(/(^|[^\d.])0(\.0+)?bb/);
  });

  it('says there is nothing to call rather than 0bb', () => {
    renderPrompt();
    expect(screen.getByText('To call').nextElementSibling).toHaveTextContent(
      'nothing'
    );
  });

  it('labels the check button with the server label, and no size', () => {
    renderPrompt();
    const check = actionGroup().getByRole('button', { name: /^Check/ });
    expect(check).toHaveTextContent('Check');
    expect(check.textContent).not.toMatch(/bb/);
  });

  it('still shows a real cost when there is one', () => {
    renderPrompt(RAISE_PROMPT, RAISE_ACTIONS);
    expect(screen.getByText('To call').nextElementSibling).toHaveTextContent(
      '2bb'
    );
  });

  it('gives check the same weight as any other line', () => {
    // Only `fold` is styled as the receding option. Checking behind is a real
    // decision and 59.6% of the chart, so it must not look like giving up.
    renderPrompt();
    const check = actionGroup().getByRole('button', { name: /^Check/ });
    const raise = actionGroup().getByRole('button', { name: /^Raise/ });
    expect(check.className).toBe(raise.className);
  });
});

describe('BvbPrompt actions', () => {
  it('renders the server labels verbatim, sizes included', () => {
    renderPrompt();
    expect(
      actionGroup().getByRole('button', { name: /^Raise to 3\.5bb/ })
    ).toBeInTheDocument();
  });

  it('emits the action id, not the label', async () => {
    const onAction = renderPrompt();
    await userEvent.click(
      actionGroup().getByRole('button', { name: /^Raise/ })
    );
    expect(onAction).toHaveBeenCalledExactlyOnceWith('raise');
  });

  it('shows each binding on its button', () => {
    renderPrompt();
    expect(
      actionGroup().getByRole('button', { name: 'Check (key c)' })
    ).toHaveAttribute('data-shortcut', 'c');
    expect(
      actionGroup().getByRole('button', { name: 'Raise to 3.5bb (key r)' })
    ).toHaveAttribute('data-shortcut', 'r');
  });

  it('disables every button while an answer is in flight', () => {
    render(
      <BvbPrompt
        prompt={LIMP_PROMPT}
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
