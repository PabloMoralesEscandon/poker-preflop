import type { ComponentType } from 'react';

import type { ActionOption, QuestionPrompt } from '../api';

/**
 * The frontend half of the modularity contract (ARCHITECTURE §4.3).
 *
 * A drill component renders one question's prompt and emits the chosen action
 * id. Fetching, progress, feedback, and the summary all belong to the shared
 * {@link DrillRunner}, so adding a drill is a new entry here and a new
 * directory — never a change to the runner.
 */
export interface DrillPromptProps<TPrompt = QuestionPrompt> {
  prompt: TPrompt;
  /** Server-provided; labels are rendered verbatim, sizings are never computed. */
  actions: ActionOption[];
  onAction: (actionId: string) => void;
  /** True while an answer is in flight, or once the question is answered. */
  disabled?: boolean;
}

export interface DrillEntry<TPrompt extends QuestionPrompt = QuestionPrompt> {
  Prompt: ComponentType<DrillPromptProps<TPrompt>>;
  /**
   * Which cell of the feedback range chart this prompt corresponds to, if any.
   *
   * The runner shows `explanation.range_id` for every drill because that field
   * is contract-level, but only the drill knows which hand its prompt was
   * about. Returning `null` renders the chart with nothing highlighted.
   */
  gridHighlight?: (prompt: TPrompt) => string | null;
}

/** Keyed by `question.prompt.kind`. */
export const drillRegistry: Record<string, DrillEntry> = {};

export function registerDrill<TPrompt extends QuestionPrompt>(
  kind: TPrompt['kind'],
  entry: DrillEntry<TPrompt>
): void {
  // Entries are heterogeneous by construction: each is typed to its own prompt
  // member, and the runner re-narrows via `prompt.kind` when it renders.
  drillRegistry[kind] = entry as unknown as DrillEntry;
}

export function getDrillEntry(kind: string): DrillEntry | undefined {
  return drillRegistry[kind];
}
