import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { ActionOption } from '@/api';
import { ActionBar } from '@/components/ActionBar';
import { assignShortcuts } from '@/lib/shortcuts';

/**
 * The buttons, extracted from the three prompts that were each carrying a copy.
 * What is pinned here is what those copies agreed on and what the drills depend
 * on: labels verbatim, actions as given, fold as the only receding option.
 */

const ACTIONS: ActionOption[] = [
  { id: 'fold', label: 'Fold' },
  { id: 'call', label: 'Call 2.5bb' },
  { id: '3bet', label: '3-Bet to 4bb' },
];

function renderBar(actions = ACTIONS, disabled = false) {
  const onAction = vi.fn();
  render(
    <ActionBar
      actions={actions}
      onAction={onAction}
      disabled={disabled}
      shortcuts={assignShortcuts(actions)}
    />
  );
  return onAction;
}

describe('ActionBar renders the server’s action set', () => {
  it('renders the labels verbatim, in the order given', () => {
    renderBar();
    expect(
      screen.getAllByRole('button').map((button) => button.textContent)
    ).toEqual(['Foldf', 'Call 2.5bbc', '3-Bet to 4bbb']);
  });

  it('emits the action id, never the label', async () => {
    const onAction = renderBar();
    await userEvent.click(screen.getByRole('button', { name: /^3-Bet/ }));
    expect(onAction).toHaveBeenCalledExactlyOnceWith('3bet');
  });

  it('synthesises no action that was not sent', () => {
    renderBar([
      { id: 'check', label: 'Check' },
      { id: 'raise', label: 'Raise to 3.5bb' },
    ]);
    expect(document.querySelector('[data-action-id="fold"]')).toBeNull();
  });
});

describe('only fold recedes', () => {
  it('gives fold a different weight from every other line', () => {
    renderBar();
    const weight = (name: RegExp) =>
      screen.getByRole('button', { name }).getAttribute('data-weight');

    expect(weight(/^Fold/)).toBe('fold');
    expect(weight(/^Call/)).toBe('play');
    expect(weight(/^3-Bet/)).toBe('play');
  });

  /** BVB-CALIBRATION §2: checking behind is 59.6% of that chart. */
  it('gives a check the same weight as a raise', () => {
    renderBar([
      { id: 'check', label: 'Check' },
      { id: 'raise', label: 'Raise to 3.5bb' },
    ]);
    const check = screen.getByRole('button', { name: /^Check/ });
    const raise = screen.getByRole('button', { name: /^Raise/ });
    expect(check.className).toBe(raise.className);
  });

  it('treats an action id it has never seen as a line worth playing', () => {
    renderBar([
      { id: 'fold', label: 'Fold' },
      { id: 'squeeze', label: 'Squeeze to 12bb' },
    ]);
    expect(
      screen
        .getByRole('button', { name: /^Squeeze/ })
        .getAttribute('data-weight')
    ).toBe('play');
  });
});

/**
 * The prompt stays on screen, disabled, underneath the feedback panel. That is
 * exactly when a player re-reads which line they took, so a disabled button has
 * to keep its fill — pale label on a dropped background is an invisible button.
 */
describe('disabled buttons stay readable', () => {
  it('keeps the fill on a disabled action', () => {
    renderBar(ACTIONS, true);
    const call = screen.getByRole('button', { name: /^Call/ });
    expect(call).toBeDisabled();
    expect(call.getAttribute('style')).toMatch(/background/);
  });

  it('disables every button at once', () => {
    renderBar(ACTIONS, true);
    for (const button of screen.getAllByRole('button')) {
      expect(button).toBeDisabled();
    }
  });
});
