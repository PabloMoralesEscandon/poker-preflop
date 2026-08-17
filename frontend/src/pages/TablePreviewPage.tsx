import { useEffect, useState } from 'react';

import { apiClient, type DrillConfig, type Question } from '../api';
import { optionsFor } from '../lib/configSchema';
import { assignShortcuts } from '../lib/shortcuts';
import { getDrillEntry } from '../drills/registry';
import '../drills/register';
import { ErrorState, LoadingState } from '../components/states';

/**
 * Development preview for the felt.
 *
 * Every registered drill's first hand, side by side, so a change to
 * {@link PokerTable} or to the shared spot chrome can be looked at in one
 * screenshot instead of played to. Like the grid preview, it reaches its data
 * through the api client rather than reading fixtures directly, so what is on
 * screen here is what a session actually renders.
 *
 * Not linked from anywhere. `/dev/table`, alongside `/dev/grid`.
 */

/** Every field's declared default — the config the form would start from. */
function defaultConfig(schema: {
  fields: Parameters<typeof optionsFor>[0][] | unknown[];
}): DrillConfig {
  const config: DrillConfig = {};
  for (const field of schema.fields as {
    key: string;
    type: string;
    default: unknown;
  }[]) {
    config[field.key] = field.default as DrillConfig[string];
  }
  return config;
}

export function TablePreviewPage() {
  const [questions, setQuestions] = useState<Question[] | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);

    void (async () => {
      try {
        const { drills } = await apiClient.listDrills();
        const dealt: Question[] = [];
        for (const drill of drills) {
          const session = await apiClient.createSession({
            drill_id: drill.id,
            config: defaultConfig(drill.config_schema),
            seed: 7,
          });
          const next = await apiClient.getNextQuestion(session.session_id);
          if (!next.done) dealt.push(next.question);
        }
        if (!cancelled) setQuestions(dealt);
      } catch (caught) {
        if (!cancelled) setError(caught);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="space-y-6">
      <div className="space-y-1">
        <h1 className="font-display text-3xl leading-none tracking-[0.04em]">
          Table preview
        </h1>
        <p className="text-fg-muted max-w-prose text-sm">
          Development preview. One dealt hand per registered drill, rendered
          through the same registry the session loop uses.
        </p>
      </div>

      {error ? <ErrorState error={error} /> : null}
      {!questions && !error ? <LoadingState label="Dealing…" /> : null}

      {questions?.map((question) => {
        const entry = getDrillEntry(question.prompt.kind);
        if (!entry) return null;
        const { Prompt } = entry;
        return (
          <div key={question.question_id} className="space-y-2">
            <h2 className="text-fg-muted font-mono text-xs tracking-wide uppercase">
              {question.prompt.kind}
            </h2>
            <Prompt
              prompt={question.prompt}
              actions={question.actions}
              onAction={() => {}}
              shortcuts={assignShortcuts(question.actions)}
            />
          </div>
        );
      })}
    </section>
  );
}
