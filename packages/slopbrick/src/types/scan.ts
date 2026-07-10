/**
 * v0.18.4 (Phase B R-M2): types split.
 * Module: scan
 *
 * Cross-module deps: imports `Category` and `Severity` from `./primitives`.
 * `Issue.signalStrength` uses a `import('../rules/signal-strength')` type
 * query (kept inline to avoid a circular import through the rules layer).
 * `FileScanResult.compositeScore` and `ScanFacts.v2` likewise use
 * inline `import()` type queries to avoid pulling the engine layer in.
 */

import type { Category, Severity } from './primitives';

export interface FixSuggestion {
  kind: 'insert' | 'replace' | 'css-anchor';
  description: string;
  targetFile?: string;
  anchor?: string;
  oldValue?: string;
  newValue?: string;
}



export interface Issue {
  ruleId: string;
  category: Category;
  severity: Severity;
  aiSpecific: boolean;
  filePath?: string;
  message: string;
  line: number;
  column: number;
  advice?: string;
  fixHint?: string;
  fix?: FixSuggestion;
  fixes?: FixSuggestion[];
  // Set by reporters that consume `getSignalStrength(ruleId)`. Omitted
  // when no metadata is available so JSON stays lean for known rules.
  signalStrength?: import('../rules/signal-strength').SignalStrengthEntry;
  /**
   * v0.17.0 — Optional rule-specific structured data that the
   * orchestration layer promotes to typed finding fields (e.g.
   * `DbFinding.table`, `DocFinding.package`). Conventions:
   *   - db/* rules: `{ table?: string, columnName?: string }`
   *   - docs/* rules: `{ package?: string, identifier?: string, link?: string }`
   * Reporters and rules that don't need this can ignore it.
   */
  extras?: Record<string, unknown>;
}



// subsequent runs can skip unchanged files. Cache invalidates on
// VERSION mismatch (defined here alongside the type so a single source
// of truth covers both runtime types and on-disk format).
export interface CachedFile {
  hash: string;
  issueCount: number;
  lastScannedAt: string;
}


export interface ScanCache {
  version: string;
  generatedAt: string;
  files: Record<string, CachedFile>;
}



export interface ClassNameFact {
  value: string;
  line: number;
  column: number;
}



export interface ElementFact {
  tag: string;
  attributes: Record<string, string | undefined>;
  classNames: ClassNameFact[];
  eventHandlers: string[];
  line: number;
  column: number;
}



export interface HookFact {
  name: string;
  line: number;
  column: number;
  hasDependencyArray?: boolean;
  body?: string;
  componentLine?: number;
  dependencies?: string[];
}



export interface HookCallFact {
  name: string;
  callee: string;
  line: number;
  column: number;
  inConditional: boolean;
  inLoop: boolean;
  inNestedFunction: boolean;
}



export interface FetchCallFact {
  line: number;
  column: number;
  hasAbortSignal: boolean;
  checksOk: boolean;
  /**
   * The URL argument to fetch(), if it could be extracted as a string literal.
   * Dynamic expressions (template strings, variables) are left undefined.
   */
  url?: string;
  /**
   * The `credentials` option if explicitly set ('omit' | 'same-origin' | 'include').
   * Undefined when not specified.
   */
  credentials?: 'omit' | 'same-origin' | 'include';
  /** HTTP method (uppercase) when explicitly set as the second argument. */
  method?: string;
}



export interface DisabledLintRuleFact {
  ruleId: string;
  line: number;
  column: number;
  scope: 'line' | 'next-line' | 'block';
}



export interface EvalCallFact {
  kind: 'eval' | 'new-function' | 'function-constructor';
  line: number;
  column: number;
}



export interface PropMutationFact {
  target: string;
  line: number;
  column: number;
}



export interface DangerouslySetInnerHtmlFact {
  line: number;
  column: number;
}



export interface OptimisticUpdateFact {
  setterName: string;
  line: number;
  column: number;
  hasCatchRollback?: boolean;
}



export interface StateBinding {
  valueName?: string;
  setterName?: string;
  line: number;
  column: number;
  valueReferenced: boolean;
  setterReferenced: boolean;
}



export interface PropPassThroughFact {
  propName: string;
  toTag: string;
  line: number;
  column: number;
}



export interface ComponentFacts {
  name?: string;
  line: number;
  column: number;
  endLine: number;
  isServerComponent: boolean;
  // Round 23: true if the component is wrapped in React.memo() or
  // React.forwardRef(). Inline event handlers are only an anti-pattern
  // when the component is memoized; otherwise the perf cost is zero.
  isMemoWrapped?: boolean;
  hookCalls: HookFact[];
  stateBindings: StateBinding[];
  propBindings: string[];
  propPassThroughs: PropPassThroughFact[];
  propUsages: string[];
}



export interface LogicalExpressionFact {
  depth: number;
  line: number;
  column: number;
  text: string;
  isOptionalChainLike: boolean;
}



export interface StylePropFact {
  source: string;
  line: number;
  column: number;
}



export interface AstroComponentFact {
  tag: string;
  hasClientDirective: boolean;
  hasEventHandler: boolean;
  line: number;
  column: number;
}



export interface ConsoleCallFact {
  method: 'log' | 'warn' | 'error' | 'info' | 'debug';
  line: number;
  column: number;
}



export interface DialogCallFact {
  method: 'alert' | 'confirm' | 'prompt';
  line: number;
  column: number;
}



export interface StringLiteralFact {
  value: string;
  line: number;
  column: number;
}



export interface JsxTextLiteralFact {
  value: string;
  line: number;
  column: number;
  parentTag?: string;
}



// Round 23: a code comment (line or block) with its full text and location.
export interface CommentFact {
  kind: 'Line' | 'Block';
  value: string;
  line: number;
  column: number;
}



export interface StateBindingFact {
  valueName: string;
  setterName: string;
  line: number;
  column: number;
}



export interface JsxAttributeStringLiteralFact {
  value: string;
  attribute: string;
  line: number;
  column: number;
}



export interface TamaguiStylePropFact {
  name: string;
  value: string;
  line: number;
  column: number;
}



export interface KeyPropFact {
  tag: string;
  valueType: 'index' | 'missing' | 'stable' | 'unknown';
  line: number;
  column: number;
}



export interface InlineEventHandlerFact {
  tag: string;
  event: string;
  source: string;
  line: number;
  column: number;
  // Round 23: true if the enclosing component is wrapped in React.memo()
  // or React.forwardRef(). The rule is only meaningful in that case because
  // inline handlers defeat memoization. Without memo, the perf cost is zero.
  hasMemoParent?: boolean;
}



export interface UseEffectBodyFact {
  line: number;
  column: number;
  source: string;
}



export interface DomQueryFact {
  method: string;
  line: number;
  column: number;
}



export interface ExplicitAnyFact {
  line: number;
  column: number;
  kind?: 'keyword' | 'missing-annotation';
}



export interface NonNullAssertionFact {
  line: number;
  column: number;
}



export interface ComponentSizeFact {
  name?: string;
  lineCount: number;
  jsxBranchCount: number;
  line: number;
  column: number;
}



export interface HookDependencyArrayFact {
  hookName: string;
  depsSource: string;
  line: number;
  column: number;
}



/**
 * flat-shape fields have been removed; consumers must read from `v2`.
 * See src/engine/types.ts for the grouped shape definition.
 */
export interface ScanFacts {
  /** Absolute file path. */
  filePath: string;
  v2: import('../engine/types').ScanFactsV2;
}



export interface ImportFact {
  source: string;
  line: number;
  column: number;
  importedNames?: string[];
}



export interface FileScanResult {
  filePath: string;
  componentCount: number;
  issues: Issue[];
  parseError?: string;
  /** Optional classified terminal outcome for a scan failure. */
  failureKind?: 'parse' | 'timeout' | 'crash' | 'internal';
  gapValues?: string[];
  styleSources?: string[];
  elementTags?: string[];
  unmatchedStringLiterals?: string[];
  /**
   *  `// slopbrick-disable` directive filtering. */
  facts?: ScanFacts;
  /**
   * v0.14.6 — Composite AI-likelihood score for this file.
   *
   * Naive Bayes log-likelihood ratio combination of all triggered
   * rules. `probability` in [0, 1] = P(AI-generated | rules fire);
   * `confidenceTier` is one of LIKELY_HUMAN / INCONCLUSIVE / LIKELY_AI
   * / VERY_LIKELY_AI per Jaeschke 1994 JAMA thresholds.
   *
   * Populated by the scan pipeline after rule execution. Undefined
   * when no rules fired (probability stays at the prior prevalence).
   */
  compositeScore?: import('@usebrick/engine').CompositeScore;
}



export interface ComponentScore {
  filePath: string;
  rawScore: number;
  componentScore: number;
  adjustedScore: number;
  componentCount: number;
}
