import type { Position } from '../api';

/**
 * Seat names in plain language.
 *
 * One table, because all three drills were carrying identical copies and the
 * fourth would have carried a fifth. The abbreviation is what the charts and
 * the range ids are keyed by, so it is always shown alongside rather than
 * replaced — a learner has to end up fluent in both.
 */
export const POSITION_NAMES: Record<Position, string> = {
  UTG: 'Under the gun',
  UTG1: 'UTG+1',
  LJ: 'Lojack',
  HJ: 'Hijack',
  CO: 'Cutoff',
  BTN: 'Button',
  SB: 'Small blind',
  BB: 'Big blind',
};

/**
 * The name for a seat this build has never heard of.
 *
 * Table formats are a wire enum declared in two languages (RANGE-DATA-FORMAT
 * §intro), so the services can legitimately disagree for the length of one
 * deploy. A seat from the future should print its own id, not `undefined`.
 */
export function positionName(position: string): string {
  return POSITION_NAMES[position as Position] ?? position;
}
