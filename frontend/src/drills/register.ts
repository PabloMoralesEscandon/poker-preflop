/**
 * Registers every drill UI. Importing this module for its side effect is the
 * single place the app learns which drills exist.
 *
 * Adding a drill is one import and one `registerDrill` call here, plus a new
 * directory under `src/drills/`. Nothing in `DrillRunner` changes.
 */

import type {
  BvbPrompt as BvbPromptData,
  RfiPrompt as RfiPromptData,
  VsRfiPrompt as VsRfiPromptData,
} from '../api';
import { BvbPrompt } from './bvb/BvbPrompt';
import { RfiPrompt } from './rfi/RfiPrompt';
import { registerDrill } from './registry';
import { VsRfiPrompt } from './vs_rfi/VsRfiPrompt';

registerDrill<RfiPromptData>('rfi', {
  Prompt: RfiPrompt,
  // The feedback chart highlights the hand that was just played.
  gridHighlight: (prompt) => prompt.hand.notation,
});

registerDrill<VsRfiPromptData>('vs_rfi', {
  Prompt: VsRfiPrompt,
  gridHighlight: (prompt) => prompt.hand.notation,
});

registerDrill<BvbPromptData>('bvb', {
  Prompt: BvbPrompt,
  gridHighlight: (prompt) => prompt.hand.notation,
});
