import { useMemo, useState } from 'react';

import type {
  ConfigField,
  ConfigSchema,
  ConfigValue,
  DrillConfig,
  IntField as IntFieldSchema,
  MultiEnumField,
} from '../api';
import { cn } from '../lib/cn';
import { optionsFor, resetMultiEnum } from '../lib/configSchema';

/**
 * Renders a drill's configuration form from its declarative `config_schema`
 * (API-CONTRACT §3). It has no knowledge of any drill: a new drill with new
 * options needs zero changes here.
 */

export interface ConfigFormProps {
  schema: ConfigSchema;
  submitLabel: string;
  onSubmit: (config: DrillConfig) => void;
  disabled?: boolean;
}

function initialConfig(schema: ConfigSchema): DrillConfig {
  const config: DrillConfig = {};
  for (const field of schema.fields) config[field.key] = field.default;
  return config;
}

export function ConfigForm({
  schema,
  submitLabel,
  onSubmit,
  disabled = false,
}: ConfigFormProps) {
  const [config, setConfig] = useState<DrillConfig>(() =>
    initialConfig(schema)
  );

  /** Fields whose options depend on the field being changed. */
  const dependents = useMemo(() => {
    const map = new Map<string, MultiEnumField[]>();
    for (const field of schema.fields) {
      if (field.type !== 'multi_enum' || !field.depends_on) continue;
      const list = map.get(field.depends_on) ?? [];
      list.push(field);
      map.set(field.depends_on, list);
    }
    return map;
  }, [schema]);

  function setValue(key: string, value: ConfigValue) {
    setConfig((previous) => {
      const next: DrillConfig = { ...previous, [key]: value };
      for (const field of dependents.get(key) ?? []) {
        const current = next[field.key];
        next[field.key] = resetMultiEnum(
          field,
          Array.isArray(current) ? current : [],
          optionsFor(field, next)
        );
      }
      return next;
    });
  }

  const emptyMultiEnum = schema.fields.some(
    (field) =>
      field.type === 'multi_enum' &&
      (config[field.key] as string[] | undefined)?.length === 0
  );

  return (
    <form
      className="space-y-6"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(config);
      }}
    >
      {schema.fields.map((field) => (
        <Field
          key={field.key}
          field={field}
          config={config}
          onChange={setValue}
          disabled={disabled}
        />
      ))}

      <button
        type="submit"
        disabled={disabled || emptyMultiEnum}
        className="bg-accent text-accent-fg rounded-lg px-5 py-2.5 text-sm font-semibold tracking-tight transition-transform enabled:hover:-translate-y-0.5 disabled:opacity-50"
        style={{ boxShadow: 'var(--shadow-raised)' }}
      >
        {submitLabel}
      </button>
    </form>
  );
}

function Field({
  field,
  config,
  onChange,
  disabled,
}: {
  field: ConfigField;
  config: DrillConfig;
  onChange: (key: string, value: ConfigValue) => void;
  disabled: boolean;
}) {
  switch (field.type) {
    case 'enum':
      return (
        <fieldset className="space-y-2">
          <legend className="text-fg text-sm font-medium">{field.label}</legend>
          <div className="flex flex-wrap gap-2">
            {field.options.map((option) => (
              <Chip
                key={option.value}
                type="radio"
                name={field.key}
                label={option.label}
                checked={config[field.key] === option.value}
                disabled={disabled}
                onChange={() => onChange(field.key, option.value)}
              />
            ))}
          </div>
        </fieldset>
      );

    case 'multi_enum': {
      const options = optionsFor(field, config);
      const selected = new Set(
        Array.isArray(config[field.key]) ? (config[field.key] as string[]) : []
      );
      return (
        <fieldset className="space-y-2">
          <legend className="text-fg text-sm font-medium">{field.label}</legend>
          <div className="flex flex-wrap gap-2">
            {options.map((option) => (
              <Chip
                key={option.value}
                type="checkbox"
                name={`${field.key}-${option.value}`}
                label={option.label}
                checked={selected.has(option.value)}
                disabled={disabled}
                onChange={(checked) => {
                  const next = new Set(selected);
                  if (checked) next.add(option.value);
                  else next.delete(option.value);
                  onChange(
                    field.key,
                    options
                      .map((entry) => entry.value)
                      .filter((value) => next.has(value))
                  );
                }}
              />
            ))}
          </div>
          {selected.size === 0 ? (
            <p role="alert" className="text-xs text-[var(--viz-series-2)]">
              Choose at least one {field.label.toLowerCase()}.
            </p>
          ) : null}
        </fieldset>
      );
    }

    case 'int':
      return (
        <IntField
          field={field}
          value={config[field.key]}
          onChange={onChange}
          disabled={disabled}
        />
      );

    case 'bool':
      return (
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            disabled={disabled}
            checked={config[field.key] === true}
            onChange={(event) => onChange(field.key, event.target.checked)}
            className="accent-accent size-4"
          />
          <span className="text-fg text-sm font-medium">{field.label}</span>
        </label>
      );
  }
}

/**
 * The text the user is typing is held separately from the committed value, so
 * clearing the box to type a new number doesn't snap back to the old one
 * mid-keystroke. The committed value is always clamped to the field's bounds;
 * the draft catches up on blur.
 */
function IntField({
  field,
  value,
  onChange,
  disabled,
}: {
  field: IntFieldSchema;
  value: ConfigValue | undefined;
  onChange: (key: string, value: ConfigValue) => void;
  disabled: boolean;
}) {
  const committed = typeof value === 'number' ? value : field.default;
  const [draft, setDraft] = useState(String(committed));

  const clamp = (candidate: number) =>
    Math.min(Math.max(candidate, field.min), field.max);

  return (
    <label className="block space-y-2">
      <span className="text-fg block text-sm font-medium">{field.label}</span>
      <input
        type="number"
        inputMode="numeric"
        min={field.min}
        max={field.max}
        step={1}
        disabled={disabled}
        value={draft}
        onChange={(event) => {
          setDraft(event.target.value);
          const parsed = Number.parseInt(event.target.value, 10);
          if (!Number.isNaN(parsed)) onChange(field.key, clamp(parsed));
        }}
        onBlur={() => {
          const parsed = Number.parseInt(draft, 10);
          const next = Number.isNaN(parsed) ? field.default : clamp(parsed);
          setDraft(String(next));
          onChange(field.key, next);
        }}
        className="border-line bg-surface text-fg w-28 rounded-md border px-2 py-1 text-sm"
      />
      <span className="text-fg-muted block text-xs">
        {field.min}–{field.max}
      </span>
    </label>
  );
}

function Chip({
  type,
  name,
  label,
  checked,
  disabled,
  onChange,
}: {
  type: 'radio' | 'checkbox';
  name: string;
  label: string;
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label
      className={cn(
        'border-line inline-flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-sm',
        checked ? 'border-accent bg-accent/10 text-fg' : 'bg-surface text-fg',
        disabled && 'cursor-not-allowed opacity-50'
      )}
    >
      <input
        type={type}
        name={name}
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="accent-accent size-3.5"
      />
      {label}
    </label>
  );
}
