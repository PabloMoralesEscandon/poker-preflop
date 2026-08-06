import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import answerCorrect from '@fixtures/answer_correct.json';
import answerIncorrect from '@fixtures/answer_incorrect.json';
import answerMixed from '@fixtures/answer_mixed.json';
import nextQuestionFixture from '@fixtures/next_question.json';

import type { AnswerResponse, NextResponse, Question } from '@/api';
import { MockApiClient } from '@/api/mock';
import { FeedbackPanel } from '@/components/FeedbackPanel';
import { drillRegistry } from '@/drills/registry';
import '@/drills/register';

const QUESTION = (
  nextQuestionFixture as unknown as NextResponse & { done: false }
).question;

const CORRECT = answerCorrect as unknown as AnswerResponse;
const INCORRECT = answerIncorrect as unknown as AnswerResponse;
const MIXED = answerMixed as unknown as AnswerResponse;

const registered = { ...drillRegistry };

beforeEach(() => {
  Object.assign(drillRegistry, registered);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function renderPanel(
  answer: AnswerResponse,
  question: Question = QUESTION,
  onNext = vi.fn()
) {
  const client = new MockApiClient();
  render(
    <FeedbackPanel
      client={client}
      answer={answer}
      question={question}
      onNext={onNext}
    />
  );
  return onNext;
}

function verdict() {
  return document.querySelector('[data-verdict]')?.getAttribute('data-verdict');
}

describe('feedback reads differently for each outcome', () => {
  it('renders a correct answer as correct', () => {
    renderPanel(CORRECT);
    expect(verdict()).toBe('correct');
    expect(screen.getByText('Correct')).toBeInTheDocument();
    expect(screen.getByText(CORRECT.explanation.summary)).toBeInTheDocument();
    expect(screen.getByText(CORRECT.explanation.detail)).toBeInTheDocument();
  });

  it('renders an incorrect answer as a miss, naming the chart action', () => {
    renderPanel(INCORRECT);
    expect(verdict()).toBe('incorrect');
    expect(screen.getByText('Not the chart action')).toBeInTheDocument();
    expect(screen.getByText(INCORRECT.explanation.summary)).toBeInTheDocument();
  });

  /**
   * The distinction that matters most: a mixed spot is neither a win nor a
   * loss, even though the contract reports `correct: true`.
   */
  it('renders a mixed answer as acceptable, not as a win', () => {
    renderPanel(MIXED);
    expect(MIXED.correct).toBe(true);
    expect(verdict()).toBe('mixed');

    expect(
      screen.getByText('Acceptable — this is a mixed spot')
    ).toBeInTheDocument();
    expect(screen.queryByText('Correct')).not.toBeInTheDocument();
    expect(screen.queryByText('Not the chart action')).not.toBeInTheDocument();
  });

  /**
   * API-CONTRACT §4.3: `mixed` and `correct` are independent. On a split hand,
   * a line the chart never takes comes back `mixed: true, correct: false` and
   * must read as a miss — otherwise the UI tells the user a wrong answer was
   * acceptable.
   */
  it('renders a wrong line in a mixed spot as a miss, not as acceptable', () => {
    renderPanel({
      ...MIXED,
      correct: false,
      mixed: true,
      chosen: { action_id: 'limp', label: 'Limp 1bb' },
    });

    expect(verdict()).toBe('incorrect');
    expect(screen.getByText('Not the chart action')).toBeInTheDocument();
    expect(
      screen.queryByText('Acceptable — this is a mixed spot')
    ).not.toBeInTheDocument();
  });

  it('still explains that the spot was mixed when the line was wrong', () => {
    renderPanel({
      ...MIXED,
      correct: false,
      mixed: true,
      chosen: { action_id: 'limp', label: 'Limp 1bb' },
    });

    const note = screen.getByText(/is not one of the lines the chart takes/);
    expect(note).toHaveTextContent('This hand is a mixed spot');
    expect(note).toHaveTextContent('Limp 1bb');
  });

  it('does not add the mixed-miss note to an accepted mixed answer', () => {
    renderPanel(MIXED);
    expect(
      screen.queryByText(/is not one of the lines the chart takes/)
    ).not.toBeInTheDocument();
  });

  it('gives the three outcomes three distinct verdicts', () => {
    const seen = new Set<string | null | undefined>();
    for (const answer of [CORRECT, INCORRECT, MIXED]) {
      const { unmount } = render(
        <FeedbackPanel
          client={new MockApiClient()}
          answer={answer}
          question={QUESTION}
          onNext={vi.fn()}
        />
      );
      seen.add(verdict());
      unmount();
    }
    expect(seen).toEqual(new Set(['correct', 'incorrect', 'mixed']));
  });

  it('reports what was played against what the chart plays', () => {
    renderPanel(INCORRECT);
    expect(screen.getByText(/You played/)).toHaveTextContent(
      'You played Raise 2.5bb'
    );
    expect(screen.getByText(/The chart plays/)).toHaveTextContent(
      'The chart plays Fold'
    );
  });

  it('states the frequency when the chart is not pure', () => {
    renderPanel(MIXED);
    expect(screen.getByText(/The chart plays/)).toHaveTextContent(
      '50% of the time'
    );
  });
});

describe('feedback chart', () => {
  it('shows the range for the answer and highlights the hand just played', async () => {
    renderPanel(CORRECT);

    await waitFor(() => expect(screen.getByRole('grid')).toBeInTheDocument());

    const highlighted = screen
      .getAllByRole('gridcell')
      .filter((cell) => cell.dataset['highlighted'] === 'true');

    expect(highlighted).toHaveLength(1);
    expect(highlighted[0]?.dataset['hand']).toBe(QUESTION.prompt.hand.notation);
    expect(highlighted[0]?.dataset['hand']).toBe('AKo');
  });

  it('labels the chart with the range id from the explanation', async () => {
    renderPanel(CORRECT);
    expect(
      await screen.findByRole('grid', { name: CORRECT.explanation.range_id })
    ).toBeInTheDocument();
  });

  it('highlights the offsuit cell for an offsuit hand', async () => {
    renderPanel(CORRECT);
    await waitFor(() => expect(screen.getByRole('grid')).toBeInTheDocument());

    const cell = screen
      .getAllByRole('gridcell')
      .find((entry) => entry.dataset['highlighted'] === 'true');
    // AKo lives below the diagonal.
    expect(Number(cell?.dataset['row'])).toBe(1);
    expect(Number(cell?.dataset['col'])).toBe(0);
  });

  it('still shows the verdict when the range cannot be loaded', async () => {
    const answer: AnswerResponse = {
      ...CORRECT,
      explanation: { ...CORRECT.explanation, range_id: 'rfi_6max_BB' },
    };
    renderPanel(answer);

    expect(screen.getByText('Correct')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByRole('grid')).not.toBeInTheDocument()
    );
  });
});

describe('feedback dismissal', () => {
  it('focuses Next hand so the keyboard lands on it', async () => {
    renderPanel(CORRECT);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Next hand' })).toHaveFocus()
    );
  });

  it('advances on click', async () => {
    const onNext = renderPanel(CORRECT);
    await userEvent.click(screen.getByRole('button', { name: 'Next hand' }));
    expect(onNext).toHaveBeenCalledOnce();
  });

  it('advances on Enter', async () => {
    const onNext = renderPanel(CORRECT);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Next hand' })).toHaveFocus()
    );
    await userEvent.keyboard('{Enter}');
    expect(onNext).toHaveBeenCalled();
  });

  it('advances on Escape', async () => {
    const onNext = renderPanel(CORRECT);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Next hand' })).toHaveFocus()
    );
    await userEvent.keyboard('{Escape}');
    expect(onNext).toHaveBeenCalled();
  });
});
