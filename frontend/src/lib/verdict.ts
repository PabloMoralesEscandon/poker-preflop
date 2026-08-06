import type { AnswerResponse } from '../api';

/**
 * How one answer should read to the user.
 *
 * `mixed` is deliberately its own case rather than a flavour of `correct`: a
 * mixed spot is neither a win nor a loss, and presenting it as either teaches
 * the wrong thing (API-CONTRACT §4.3).
 *
 * `correct` is checked first, and that order matters. `mixed` and `correct` are
 * independent flags: on a split hand, an action the chart never takes comes
 * back `mixed: true, correct: false`. "Mixed" widens what counts as acceptable;
 * it does not make everything acceptable, so a wrong answer must read as wrong
 * even in a mixed spot.
 */
export type Verdict = 'correct' | 'mixed' | 'incorrect';

export function verdictOf(answer: AnswerResponse): Verdict {
  if (!answer.correct) return 'incorrect';
  return answer.mixed ? 'mixed' : 'correct';
}

/** True for the case above: wrong line chosen in a spot that is itself mixed. */
export function isMissInMixedSpot(answer: AnswerResponse): boolean {
  return answer.mixed === true && !answer.correct;
}
