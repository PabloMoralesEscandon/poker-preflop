import type { AnswerResponse } from '../api';

/**
 * How one answer should read to the user.
 *
 * `mixed` is deliberately its own case rather than a flavour of `correct`: a
 * mixed spot is neither a win nor a loss, and presenting it as either teaches
 * the wrong thing (API-CONTRACT §4.3).
 */
export type Verdict = 'correct' | 'mixed' | 'incorrect';

export function verdictOf(answer: AnswerResponse): Verdict {
  if (answer.mixed) return 'mixed';
  return answer.correct ? 'correct' : 'incorrect';
}
