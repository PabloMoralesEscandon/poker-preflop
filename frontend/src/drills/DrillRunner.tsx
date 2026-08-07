import { useCallback, useEffect, useRef, useState } from 'react';

import {
  apiClient,
  type AnswerResponse,
  type ApiClient,
  type DrillConfig,
  type DrillInfo,
  type Question,
  type SessionSummary,
} from '../api';
import { ConfigForm } from '../components/ConfigForm';
import { FeedbackPanel } from '../components/FeedbackPanel';
import { SummaryView } from '../components/SummaryView';
import { ErrorState, LoadingState, ProgressBar } from '../components/states';
import { toStoredSession } from '../lib/history';
import { saveSession } from '../lib/historyStorage';
import { getDrillEntry } from './registry';

/**
 * The session loop, shared by every drill:
 *
 *   config → question → answer → feedback → next → summary
 *
 * It knows nothing about any particular drill. The prompt is delegated to the
 * component registered for `question.prompt.kind`; the config screen is
 * generated from `config_schema`; the summary is generated from `breakdown`.
 */

type Phase =
  | { name: 'config' }
  | { name: 'question' }
  | { name: 'feedback'; answer: AnswerResponse; question: Question }
  | { name: 'summary' };

export interface DrillRunnerProps {
  drillId: string;
  /** Injectable for tests; defaults to the app's configured client. */
  client?: ApiClient;
}

export function DrillRunner({ drillId, client = apiClient }: DrillRunnerProps) {
  const [drill, setDrill] = useState<DrillInfo | null>(null);
  const [drillError, setDrillError] = useState<unknown>(null);

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>({ name: 'config' });
  const [question, setQuestion] = useState<Question | null>(null);
  const [summary, setSummary] = useState<SessionSummary | null>(null);
  const [progress, setProgress] = useState({ answered: 0, correct: 0 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  /** The config the current session was created with, for the history record. */
  const configRef = useRef<DrillConfig>({});
  /** Session ids already written to history, so a re-render cannot double-add. */
  const recorded = useRef(new Set<string>());

  const loadDrill = useCallback(() => {
    setDrillError(null);
    setDrill(null);
    let cancelled = false;
    client
      .listDrills()
      .then((response) => {
        if (cancelled) return;
        const found = response.drills.find((entry) => entry.id === drillId);
        if (found) setDrill(found);
        else setDrillError(new Error(`Unknown drill id ${drillId}.`));
      })
      .catch((caught: unknown) => {
        if (!cancelled) setDrillError(caught);
      });
    return () => {
      cancelled = true;
    };
  }, [client, drillId]);

  useEffect(() => loadDrill(), [loadDrill]);

  const advance = useCallback(
    async (id: string) => {
      setBusy(true);
      setError(null);
      try {
        const next = await client.getNextQuestion(id);
        if (next.done) {
          setQuestion(null);
          const finished = await client.getSummary(id);
          setSummary(finished);
          setPhase({ name: 'summary' });
          // Recorded once, here, because this is the only place a session is
          // known to be over. Storage failures are swallowed by saveSession —
          // losing a history row must never interrupt the drill.
          if (!recorded.current.has(id)) {
            recorded.current.add(id);
            saveSession(
              toStoredSession(
                finished,
                configRef.current,
                new Date().toISOString()
              )
            );
          }
        } else {
          setQuestion(next.question);
          setPhase({ name: 'question' });
        }
      } catch (caught) {
        setError(caught);
      } finally {
        setBusy(false);
      }
    },
    [client]
  );

  const start = useCallback(
    async (config: DrillConfig) => {
      setBusy(true);
      setError(null);
      try {
        const session = await client.createSession({
          drill_id: drillId,
          config,
        });
        setSessionId(session.session_id);
        configRef.current = session.config;
        setProgress({ answered: 0, correct: 0 });
        setSummary(null);
        await advance(session.session_id);
      } catch (caught) {
        setError(caught);
      } finally {
        setBusy(false);
      }
    },
    [advance, client, drillId]
  );

  const answer = useCallback(
    async (actionId: string) => {
      if (!sessionId || !question || busy) return;
      setBusy(true);
      setError(null);
      try {
        const response = await client.submitAnswer(sessionId, {
          question_id: question.question_id,
          action_id: actionId,
        });
        setProgress({
          answered: response.progress.answered,
          correct: response.progress.correct,
        });
        setPhase({ name: 'feedback', answer: response, question });
      } catch (caught) {
        setError(caught);
      } finally {
        setBusy(false);
      }
    },
    [busy, client, question, sessionId]
  );

  const restart = useCallback(() => {
    setSessionId(null);
    setQuestion(null);
    setSummary(null);
    setProgress({ answered: 0, correct: 0 });
    setError(null);
    setPhase({ name: 'config' });
  }, []);

  if (drillError) {
    return <ErrorState error={drillError} onRetry={loadDrill} />;
  }
  if (!drill) {
    return <LoadingState label="Loading drill…" />;
  }

  const total =
    question?.total ??
    (phase.name === 'feedback'
      ? phase.question.total
      : (summary?.answered ?? 0));

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{drill.name}</h1>
        <p className="text-fg-muted max-w-prose text-sm">{drill.description}</p>
      </header>

      {phase.name !== 'config' && total > 0 ? (
        <ProgressBar
          answered={progress.answered}
          correct={progress.correct}
          total={total}
        />
      ) : null}

      {error ? (
        <ErrorState
          error={error}
          onRetry={
            sessionId ? () => void advance(sessionId) : () => setError(null)
          }
        />
      ) : null}

      {phase.name === 'config' ? (
        <ConfigForm
          schema={drill.config_schema}
          submitLabel={busy ? 'Starting…' : 'Start session'}
          disabled={busy}
          onSubmit={(config) => void start(config)}
        />
      ) : null}

      {phase.name === 'question' ? (
        question ? (
          <PromptSlot question={question} disabled={busy} onAction={answer} />
        ) : (
          <LoadingState label="Loading hand…" />
        )
      ) : null}

      {phase.name === 'feedback' ? (
        <FeedbackPanel
          client={client}
          answer={phase.answer}
          question={phase.question}
          busy={busy}
          onNext={() => sessionId && void advance(sessionId)}
        />
      ) : null}

      {phase.name === 'summary' && summary ? (
        <SummaryView summary={summary} onRestart={restart} />
      ) : null}
    </div>
  );
}

/** Resolves `prompt.kind` through the registry. */
function PromptSlot({
  question,
  disabled,
  onAction,
}: {
  question: Question;
  disabled: boolean;
  onAction: (actionId: string) => void;
}) {
  const entry = getDrillEntry(question.prompt.kind);

  if (!entry) {
    return (
      <ErrorState
        error={
          new Error(
            `No UI is registered for prompt kind "${question.prompt.kind}".`
          )
        }
      />
    );
  }

  const { Prompt } = entry;
  return (
    <Prompt
      prompt={question.prompt}
      actions={question.actions}
      onAction={onAction}
      disabled={disabled}
    />
  );
}
