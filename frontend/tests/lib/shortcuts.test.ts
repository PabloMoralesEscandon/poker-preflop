import { describe, expect, it } from 'vitest';

import type { ActionOption } from '@/api';
import { assignShortcuts, shortcutMap } from '@/lib/shortcuts';

const actions = (...ids: string[]): ActionOption[] =>
  ids.map((id) => ({ id, label: id }));

describe('deriving keyboard bindings from a question actions', () => {
  it('uses the first letter of each action id', () => {
    expect(assignShortcuts(actions('fold', 'raise'))).toEqual([
      { actionId: 'fold', key: 'f', label: 'fold' },
      { actionId: 'raise', key: 'r', label: 'raise' },
    ]);
  });

  it('handles the three-action small blind', () => {
    const keys = assignShortcuts(actions('fold', 'raise', 'limp')).map(
      (shortcut) => shortcut.key
    );
    expect(keys).toEqual(['f', 'r', 'l']);
  });

  it('never assigns the same key twice', () => {
    const shortcuts = assignShortcuts(
      actions('call', 'check', 'complete', 'continue')
    );
    const keys = shortcuts.map((shortcut) => shortcut.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('falls back to a later letter of the id when the first is taken', () => {
    const byId = Object.fromEntries(
      assignShortcuts(actions('call', 'check')).map((s) => [s.actionId, s.key])
    );
    expect(byId['call']).toBe('c');
    expect(byId['check']).toBe('h');
  });

  it('falls back to digits when the letters run out', () => {
    const shortcuts = assignShortcuts(actions('ab', 'ab2', 'ba'));
    const keys = shortcuts.map((shortcut) => shortcut.key);
    expect(new Set(keys).size).toBe(3);
    expect(keys.some((key) => /[0-9]/.test(key))).toBe(true);
  });

  it('binds action ids it has never seen, for a drill that does not exist yet', () => {
    const shortcuts = assignShortcuts(actions('fold', 'squeeze', 'jam'));
    expect(shortcuts.map((s) => s.key)).toEqual(['f', 's', 'j']);
  });

  it('is stable: the same actions always give the same keys', () => {
    const once = assignShortcuts(actions('fold', 'raise', 'limp'));
    const twice = assignShortcuts(actions('fold', 'raise', 'limp'));
    expect(once).toEqual(twice);
  });

  it('returns nothing for no actions', () => {
    expect(assignShortcuts([])).toEqual([]);
  });

  it('maps keys to action ids for dispatch', () => {
    expect(shortcutMap(assignShortcuts(actions('fold', 'raise')))).toEqual({
      f: 'fold',
      r: 'raise',
    });
  });
});
