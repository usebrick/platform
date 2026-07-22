import { parseOutcomeEventV1 } from './outcome-event-codec';

export * from './outcome-event-types';
export { OUTCOME_EVENT_SCHEMA_V1 } from './outcome-event-schema';

export type OutcomeEventValidationV1 =
  | { readonly ok: true; readonly errors: readonly [] }
  | { readonly ok: false; readonly errors: readonly string[] };

export function validateOutcomeEventV1(value: unknown): OutcomeEventValidationV1 {
  const parsed = parseOutcomeEventV1(value);
  return parsed.ok
    ? { ok: true, errors: [] }
    : { ok: false, errors: parsed.errors };
}
