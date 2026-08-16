/**
 * Formatting for amounts in big blinds.
 *
 * One place, because the `vs_limp` spot turned an identical three-line helper
 * copy-pasted into two components into a bug: `check` is a real action whose
 * size is `0.0` (RANGE-DATA-FORMAT §9), and every naive formatter renders that
 * as "0bb" — which reads as a missing value, or worse as a chip amount.
 *
 * So there are two functions, and picking between them is the whole point:
 *
 *  - {@link formatBb} for an amount that is never zero — a pot, a raise size.
 *  - {@link formatChips} for an amount that legitimately can be — an action's
 *    cost, or what hero still owes when they are already in for free.
 */

/**
 * The number alone: `4` → `"4"`, `2.5` → `"2.5"`, `8.75` → `"8.75"`.
 *
 * Trailing zeros are dropped because `4.0bb` reads as false precision, and the
 * second decimal is kept because 3-bet sizes are genuinely `8.75` — rounding it
 * to one place would misreport a size the chart states exactly
 * (VS-RFI-CALIBRATION §1.1).
 */
export function bbAmount(value: number): string {
  return String(Math.round(value * 100) / 100);
}

/** `2.5` → `"2.5bb"`, `4` → `"4bb"`. */
export function formatBb(value: number): string {
  return `${bbAmount(value)}bb`;
}

/**
 * The same, except that zero is spelled out rather than rendered as `0bb`.
 *
 * Checking behind a limp costs nothing; saying so in words is both shorter and
 * true, where "0bb" invites the reader to wonder what went missing.
 */
export function formatChips(value: number): string {
  return value === 0 ? 'no chips' : formatBb(value);
}
