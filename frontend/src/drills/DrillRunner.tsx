import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

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
import { assignShortcuts, shortcutMap, type Shortcut } from '../lib/shortcuts';
import { useKeyboardShortcuts } from '../lib/useKeyboardShortcuts';
import { verdictOf } from '../lib/verdict';
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

  const shortcuts = useMemo(
    () => (question ? assignShortcuts(question.actions) : []),
    [question]
  );

  // One place owns the keyboard for the whole session: actions while a question
  // is up, "move on" while feedback is up.
  useKeyboardShortcuts(
    useMemo(() => {
      if (phase.name === 'question') {
        const byKey = shortcutMap(shortcuts);
        return Object.fromEntries(
          Object.entries(byKey).map(([key, actionId]) => [
            key,
            () => void answer(actionId),
          ])
        );
      }
      if (phase.name === 'feedback') {
        const next = () => sessionId && void advance(sessionId);
        return { enter: next, ' ': next, escape: next, n: next };
      }
      return {};
    }, [advance, answer, phase.name, sessionId, shortcuts]),
    phase.name === 'question' || phase.name === 'feedback'
  );

  /**
   * A short, self-contained sentence for the live region. The feedback panel
   * itself is not a live region: announcing a 169-cell chart on every answer
   * would be unusable.
   */
  const announcement =
    phase.name === 'feedback'
      ? `${verdictLabel(verdictOf(phase.answer))}. ${phase.answer.explanation.summary}`
      : '';

  /** Focus moves to the question when it changes, so the keyboard follows it. */
  const questionRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (phase.name === 'question') questionRef.current?.focus();
  }, [phase.name, question?.question_id]);

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
          <div
            ref={questionRef}
            tabIndex={-1}
            aria-label={`Hand ${question.index} of ${question.total}`}
            className="focus:outline-none"
          >
            <PromptSlot
              question={question}
              disabled={busy}
              onAction={answer}
              shortcuts={shortcuts}
            />
          </div>
        ) : (
          <LoadingState label="Loading hand…" />
        )
      ) : null}

      {phase.name === 'feedback' ? (
        <>
          {/*
            The prompt stays on screen, disabled, while the feedback appears
            below it. Nothing that was already visible moves, and the hand you
            were asked about is still there to compare against the chart.
          */}
          <PromptSlot
            question={phase.question}
            disabled
            onAction={() => {}}
            shortcuts={assignShortcuts(phase.question.actions)}
          />
          <FeedbackPanel
            client={client}
            answer={phase.answer}
            question={phase.question}
            busy={busy}
            onNext={() => sessionId && void advance(sessionId)}
          />
        </>
      ) : null}

      {phase.name === 'summary' && summary ? (
        <SummaryView summary={summary} onRestart={restart} />
      ) : null}

      {/* The only live region in the session: one sentence per answer. */}
      <p aria-live="polite" role="status" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}

/** Resolves `prompt.kind` through the registry. */
function PromptSlot({
  question,
  disabled,
  onAction,
  shortcuts,
}: {
  question: Question;
  disabled: boolean;
  onAction: (actionId: string) => void;
  shortcuts: Shortcut[];
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
      shortcuts={shortcuts}
    />
  );
}

function verdictLabel(verdict: 'correct' | 'mixed' | 'incorrect'): string {
  if (verdict === 'correct') return 'Correct';
  if (verdict === 'mixed') return 'Acceptable, a mixed spot';
  return 'Not the chart action';
}
