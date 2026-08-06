import type { ActionFrequencies } from './types';

/**
 * The grading rule from API-CONTRACT §4.3, as a pure function.
 *
 * It lives apart from the mock client for two reasons: the rule is contract
 * logic rather than mock behaviour, and every row of the section's worked
 * example table can then be asserted directly instead of only through whichever
 * cells happen to exist in a chart.
 *
 * §4.3 was rewritten on 2026-08-07 to resolve a contradiction. Two things it
 * settled, both easy to get wrong:
 *
 *  - **Fold is an action.** A grid cell stores only non-fold frequencies, so
 *    fold's is `1 - sum(values)`. Once that entry is added, every rule here is
 *    uniform across actions and nothing special-cases `raise`.
 *  - **`mixed` and `correct` are independent.** On a split hand, an action the
 *    chart never takes is still wrong. Mixed widens what counts as acceptable;
 *    it does not make everything acceptable.
 */

export const FOLD_ACTION_ID = 'fold';

export interface GradeResult {
  /** True when the chart ever takes this line. */
  correct: boolean;
  /** True when more than one action has non-zero frequency, fold included. */
  mixed: boolean;
  expectedActionId: string;
  /** The expected action's own frequency — `1.0` for a pure fold. */
  expectedFrequency: number;
  /** The full action → frequency map, fold included. */
  frequencies: ActionFrequencies;
}

/** Rounds away the float noise in `1 - 0.7`. */
function round(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

/** Adds the implied fold entry to a stored grid cell. */
export function withFold(cell: ActionFrequencies): ActionFrequencies {
  const played = Object.values(cell).reduce((sum, value) => sum + value, 0);
  return { ...cell, [FOLD_ACTION_ID]: round(1 - played, 6) };
}

/**
 * @param cell         the stored grid cell (non-fold frequencies only)
 * @param actionOrder  the range's `actions` list; ties break by this order,
 *                     with fold last
 */
export function gradeCell(
  cell: ActionFrequencies,
  actionOrder: readonly string[],
  chosenActionId: string
): GradeResult {
  const frequencies = withFold(cell);

  let expectedActionId = FOLD_ACTION_ID;
  let expectedFrequency = -1;
  for (const actionId of [...actionOrder, FOLD_ACTION_ID]) {
    const frequency = frequencies[actionId] ?? 0;
    if (frequency > expectedFrequency) {
      expectedActionId = actionId;
      expectedFrequency = frequency;
    }
  }

  return {
    correct: (frequencies[chosenActionId] ?? 0) > 0,
    mixed:
      Object.values(frequencies).filter((frequency) => frequency > 0).length >
      1,
    expectedActionId,
    expectedFrequency: round(expectedFrequency, 2),
    frequencies,
  };
}
