/**
 * Registers every drill UI. Importing this module for its side effect is the
 * single place the app learns which drills exist.
 *
 * Adding a drill is one import and one `registerDrill` call here, plus a new
 * directory under `src/drills/`. Nothing in `DrillRunner` changes.
 */

import type { RfiPrompt as RfiPromptData } from '../api';
import { RfiPrompt } from './rfi/RfiPrompt';
import { registerDrill } from './registry';

registerDrill<RfiPromptData>('rfi', {
  Prompt: RfiPrompt,
  // The feedback chart highlights the hand that was just played.
  gridHighlight: (prompt) => prompt.hand.notation,
});
