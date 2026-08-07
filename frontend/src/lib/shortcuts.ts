import type { ActionOption } from '../api';

/**
 * Keyboard bindings for a question's actions.
 *
 * Derived from the actions the server sent, never hardcoded: a drill with
 * different actions gets sensible keys with no changes here. A letter from the
 * action id is preferred because `r` for raise is memorable in a way that `2`
 * is not; digits are the fallback when the letters collide.
 */

export interface Shortcut {
  actionId: string;
  /** Lowercase, as it arrives from `KeyboardEvent.key`. */
  key: string;
  label: string;
}

const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

export function assignShortcuts(actions: readonly ActionOption[]): Shortcut[] {
  const taken = new Set<string>();
  const assigned = new Map<string, string>();

  // First choice: a letter from the action id, earliest unused one.
  for (const action of actions) {
    for (const character of action.id.toLowerCase()) {
      if (character < 'a' || character > 'z') continue;
      if (taken.has(character)) continue;
      taken.add(character);
      assigned.set(action.id, character);
      break;
    }
  }

  // Fallback: digits, in the order the actions were given.
  let digit = 0;
  for (const action of actions) {
    if (assigned.has(action.id)) continue;
    while (digit < DIGITS.length && taken.has(DIGITS[digit]!)) digit += 1;
    const key = DIGITS[digit];
    if (key === undefined) continue;
    taken.add(key);
    assigned.set(action.id, key);
  }

  return actions.flatMap((action) => {
    const key = assigned.get(action.id);
    return key ? [{ actionId: action.id, key, label: action.label }] : [];
  });
}

/** `KeyboardEvent.key` → action id, for the current question. */
export function shortcutMap(
  shortcuts: readonly Shortcut[]
): Record<string, string> {
  return Object.fromEntries(
    shortcuts.map((shortcut) => [shortcut.key, shortcut.actionId])
  );
}
