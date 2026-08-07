import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import drillsFixture from '@fixtures/drills.json';

import type { DrillsResponse, MultiEnumField } from '@/api';
import { ConfigForm } from '@/components/ConfigForm';
import { optionsFor, resetMultiEnum } from '@/lib/configSchema';

const DRILLS = drillsFixture as DrillsResponse;
const SCHEMA = DRILLS.drills[0]!.config_schema;

const positionsField = SCHEMA.fields.find(
  (field): field is MultiEnumField => field.key === 'positions'
)!;

function renderForm(onSubmit = vi.fn()) {
  render(
    <ConfigForm
      schema={SCHEMA}
      submitLabel="Start session"
      onSubmit={onSubmit}
    />
  );
  return onSubmit;
}

describe('ConfigForm rendered from the drills fixture', () => {
  it('renders a control for every field in the schema', () => {
    renderForm();
    for (const field of SCHEMA.fields) {
      expect(
        screen.getByText(field.label, { selector: 'legend, span' })
      ).toBeInTheDocument();
    }
  });

  it('renders enum fields as one option per value', () => {
    renderForm();
    expect(screen.getByRole('radio', { name: '6-max' })).toBeChecked();
    expect(
      screen.getByRole('radio', { name: '8-max (full ring)' })
    ).not.toBeChecked();
  });

  it('renders the int field with its documented bounds', () => {
    renderForm();
    const hands = screen.getByRole('spinbutton', { name: /Hands/ });
    expect(hands).toHaveValue(25);
    expect(hands).toHaveAttribute('min', '5');
    expect(hands).toHaveAttribute('max', '200');
  });

  it('preselects the schema defaults for the multi_enum', () => {
    renderForm();
    for (const label of ['UTG', 'Hijack', 'Cutoff', 'Button', 'Small blind']) {
      expect(screen.getByRole('checkbox', { name: label })).toBeChecked();
    }
  });

  it('shows only the option set for the current dependency value', () => {
    renderForm();
    expect(
      screen.queryByRole('checkbox', { name: 'Lojack' })
    ).not.toBeInTheDocument();
  });

  it('submits the collected config', async () => {
    const onSubmit = renderForm();
    await userEvent.click(
      screen.getByRole('button', { name: 'Start session' })
    );

    expect(onSubmit).toHaveBeenCalledExactlyOnceWith({
      table_format: '6max',
      positions: ['UTG', 'HJ', 'CO', 'BTN', 'SB'],
      question_count: 25,
      weighting: 'borderline',
    });
  });

  it('clamps the int field to its range', async () => {
    const onSubmit = renderForm();
    const hands = screen.getByRole('spinbutton', { name: /Hands/ });
    await userEvent.clear(hands);
    await userEvent.type(hands, '900');
    await userEvent.click(
      screen.getByRole('button', { name: 'Start session' })
    );

    expect(onSubmit.mock.calls[0]?.[0]).toMatchObject({ question_count: 200 });
  });

  it('blocks submitting with an empty multi_enum', async () => {
    const onSubmit = renderForm();
    for (const label of ['UTG', 'Hijack', 'Cutoff', 'Button', 'Small blind']) {
      await userEvent.click(screen.getByRole('checkbox', { name: label }));
    }

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Start session' })
    ).toBeDisabled();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

/** API-CONTRACT §3: the documented reset rule when `depends_on` changes. */
describe('multi_enum reset when its dependency changes', () => {
  it('swaps to the 8-max option set and keeps the overlapping selection', async () => {
    const onSubmit = renderForm();
    await userEvent.click(
      screen.getByRole('radio', { name: '8-max (full ring)' })
    );

    // Lojack only exists at full ring.
    expect(
      screen.getByRole('checkbox', { name: 'Lojack' })
    ).toBeInTheDocument();
    // The default 6-max selection is entirely valid at 8-max, so it survives.
    for (const label of ['UTG', 'Hijack', 'Cutoff', 'Button', 'Small blind']) {
      expect(screen.getByRole('checkbox', { name: label })).toBeChecked();
    }
    expect(screen.getByRole('checkbox', { name: 'Lojack' })).not.toBeChecked();

    await userEvent.click(
      screen.getByRole('button', { name: 'Start session' })
    );
    expect(onSubmit.mock.calls[0]?.[0]).toMatchObject({
      table_format: '8max',
      positions: ['UTG', 'HJ', 'CO', 'BTN', 'SB'],
    });
  });

  it('drops selections that do not exist in the new option set', async () => {
    const onSubmit = renderForm();

    await userEvent.click(
      screen.getByRole('radio', { name: '8-max (full ring)' })
    );
    // Select only full-ring-exclusive seats.
    for (const label of ['UTG', 'Hijack', 'Cutoff', 'Button', 'Small blind']) {
      await userEvent.click(screen.getByRole('checkbox', { name: label }));
    }
    await userEvent.click(screen.getByRole('checkbox', { name: 'Lojack' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'UTG+1' }));

    // Back to 6-max: neither LJ nor UTG1 exists there, so the intersection is
    // empty and the field falls back to the schema default.
    await userEvent.click(screen.getByRole('radio', { name: '6-max' }));
    await userEvent.click(
      screen.getByRole('button', { name: 'Start session' })
    );

    expect(onSubmit.mock.calls[0]?.[0]).toMatchObject({
      table_format: '6max',
      positions: ['UTG', 'HJ', 'CO', 'BTN', 'SB'],
    });
  });
});

describe('the reset rule as a pure function', () => {
  const sixMax = optionsFor(positionsField, { table_format: '6max' });
  const fullRing = optionsFor(positionsField, { table_format: '8max' });

  it('resolves options_by through depends_on', () => {
    expect(sixMax.map((option) => option.value)).toEqual([
      'UTG',
      'HJ',
      'CO',
      'BTN',
      'SB',
    ]);
    expect(fullRing.map((option) => option.value)).toContain('LJ');
  });

  it('keeps the intersection when one exists', () => {
    expect(resetMultiEnum(positionsField, ['CO', 'LJ'], sixMax)).toEqual([
      'CO',
    ]);
  });

  it('falls back to the default when the intersection is empty', () => {
    expect(resetMultiEnum(positionsField, ['LJ', 'UTG1'], sixMax)).toEqual([
      'UTG',
      'HJ',
      'CO',
      'BTN',
      'SB',
    ]);
  });

  it('keeps a selection that is wholly valid in the new set', () => {
    expect(resetMultiEnum(positionsField, ['UTG', 'BTN'], fullRing)).toEqual([
      'UTG',
      'BTN',
    ]);
  });
});
