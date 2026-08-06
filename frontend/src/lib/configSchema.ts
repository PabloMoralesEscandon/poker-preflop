import type { ConfigOption, DrillConfig, MultiEnumField } from '../api';

/**
 * Pure helpers for the declarative config schema (API-CONTRACT §3). They live
 * apart from the form so the documented rules can be unit-tested directly.
 */

/** The option list for a field, resolved against the current form state. */
export function optionsFor(
  field: MultiEnumField,
  config: DrillConfig
): ConfigOption[] {
  if (field.options) return field.options;
  if (!field.depends_on || !field.options_by) return [];
  const dependency = config[field.depends_on];
  return field.options_by[String(dependency)] ?? [];
}

/**
 * When `depends_on` changes, reset the field to the intersection of the current
 * selection and the new option set, falling back to `default` if that
 * intersection is empty.
 */
export function resetMultiEnum(
  field: MultiEnumField,
  current: readonly string[],
  nextOptions: readonly ConfigOption[]
): string[] {
  const allowed = new Set(nextOptions.map((option) => option.value));
  const intersection = current.filter((value) => allowed.has(value));
  if (intersection.length > 0) return intersection;
  return field.default.filter((value) => allowed.has(value));
}
