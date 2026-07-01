// v0.18.8: dead-code rule index.
//
// Exposes the 5 dead/* rules (shipped in v0.18.5, defaultOff: true,
// no calibration) plus helpers for the v8a focused scan and any
// future dead-code work.
//
// The 5 rules + their categories + their severities:
//
//   dead/unused-import     — logic / low   — `defaultOff: true`
//   dead/unused-local      — logic / low   — `defaultOff: true`
//   dead/unused-parameter  — logic / low   — `defaultOff: true`
//   dead/dead-branch       — logic / medium — `defaultOff: true`
//   dead/unreachable       — logic / medium — `defaultOff: true`
//
// All 5 share the same engine extraction: `facts.v2.deadCode`.
// The visitor in `src/engine/visitors/scan-helpers.ts` computes
// `bindings[]`, `constantConditions[]`, and `unreachableStatements[]`
// per file; each rule filters that data into its own issue list.

import type { Rule } from '../../types';
import { deadBranchRule } from './dead-branch';
import { unreachableRule } from './unreachable';
import { unusedImportRule } from './unused-import';
import { unusedLocalRule } from './unused-local';
import { unusedParameterRule } from './unused-parameter';

export const deadRules: Rule[] = [
  deadBranchRule,
  unreachableRule,
  unusedImportRule,
  unusedLocalRule,
  unusedParameterRule,
];

export const deadRuleIds: readonly string[] = deadRules.map((r) => r.id);

export function isDeadRuleId(ruleId: string): boolean {
  return deadRuleIds.includes(ruleId);
}
