import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import summaryFixture from '@fixtures/summary.json';

import type { SessionSummary } from '@/api';
import { SummaryView } from '@/components/SummaryView';

const SUMMARY = summaryFixture as unknown as SessionSummary;

function rowFor(key: string) {
  const cell = screen.getByRole('rowheader', { name: key });
  return cell.closest('tr')!;
}

function renderSummary(summary: SessionSummary) {
  render(
    <MemoryRouter
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <SummaryView summary={summary} />
    </MemoryRouter>
  );
}

describe('SummaryView renders the fixture generically', () => {
  it('shows overall accuracy and the answered count', () => {
    renderSummary(SUMMARY);
    expect(screen.getByLabelText('Session accuracy 84%')).toBeInTheDocument();
    expect(screen.getByText('21 of 25 correct')).toBeInTheDocument();
  });

  it('renders one row per breakdown entry, using its own label', () => {
    renderSummary(SUMMARY);
    for (const row of SUMMARY.breakdown) {
      expect(rowFor(row.label)).toBeInTheDocument();
    }
  });

  it('lists every mistake with its key and both actions', () => {
    renderSummary(SUMMARY);
    expect(screen.getByText(/Missed \(4\)/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'K9s' })).toBeInTheDocument();
  });

  it('links each missed hand to its own range chart, highlighted', () => {
    renderSummary(SUMMARY);
    expect(screen.getByRole('link', { name: 'K9s' })).toHaveAttribute(
      'href',
      '/charts/rfi_6max_UTG?hand=K9s'
    );
    expect(screen.getByRole('link', { name: '65s' })).toHaveAttribute(
      'href',
      '/charts/rfi_6max_HJ?hand=65s'
    );
  });

  it('offers a way through to the cross-session history', () => {
    renderSummary(SUMMARY);
    expect(screen.getByRole('link', { name: 'History' })).toHaveAttribute(
      'href',
      '/history'
    );
  });
});

/**
 * The live backend returns a row for every configured key, including ones the
 * session never reached. Rendering `0/0` as `0%` tells the user they got a
 * position entirely wrong when they simply never saw it.
 */
describe('breakdown rows the session never reached', () => {
  const withUntouched: SessionSummary = {
    ...SUMMARY,
    answered: 3,
    correct: 2,
    accuracy: 0.667,
    complete: false,
    breakdown: [
      { key: 'UTG', label: 'UTG', answered: 0, correct: 0, accuracy: 0 },
      { key: 'CO', label: 'Cutoff', answered: 3, correct: 2, accuracy: 0.667 },
      { key: 'SB', label: 'Small blind', answered: 0, correct: 0, accuracy: 0 },
    ],
    mistakes: [],
  };

  it('shows a dash rather than 0% for an untouched key', () => {
    renderSummary(withUntouched);

    const utg = rowFor('UTG');
    expect(utg).toHaveTextContent('—');
    expect(utg).not.toHaveTextContent('0%');
    expect(utg.getAttribute('data-answered')).toBe('0');
  });

  it('still shows real numbers for a key that was drilled', () => {
    renderSummary(withUntouched);

    const co = rowFor('Cutoff');
    expect(co).toHaveTextContent('2/3');
    expect(co).toHaveTextContent('67%');
    expect(co).not.toHaveTextContent('—');
  });

  it('keeps every configured key visible, drilled or not', () => {
    renderSummary(withUntouched);
    for (const label of ['UTG', 'Cutoff', 'Small blind']) {
      expect(rowFor(label)).toBeInTheDocument();
    }
  });

  it('renders a genuine 0% when the key was drilled and all were missed', () => {
    renderSummary({
      ...withUntouched,
      breakdown: [
        { key: 'UTG', label: 'UTG', answered: 4, correct: 0, accuracy: 0 },
      ],
    });
    const utg = rowFor('UTG');
    expect(utg).toHaveTextContent('0%');
    expect(utg).toHaveTextContent('0/4');
  });
});
