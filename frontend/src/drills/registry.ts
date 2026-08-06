import type { ComponentType } from 'react';

/**
 * A drill component renders one question's prompt and emits the chosen action
 * id. Everything else — fetching, feedback, progress, summary — belongs to the
 * shared runner, so adding a drill never touches the runner.
 */
export interface DrillPromptProps {
  prompt: unknown;
  onAnswer: (actionId: string) => void;
  disabled?: boolean;
}

export type DrillComponent = ComponentType<DrillPromptProps>;

/** Keyed by `question.prompt.kind` from the API contract. */
export const drillComponents: Record<string, DrillComponent> = {};

export function getDrillComponent(kind: string): DrillComponent | undefined {
  return drillComponents[kind];
}
