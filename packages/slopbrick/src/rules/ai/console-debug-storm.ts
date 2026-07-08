import type { Issue, Rule, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';

/**
 * AI console debug storm.
 *
 * Per GitClear (2025), "AI Copilot Code Quality: 2024's Increased
 * Defect Rate" — analysis of 150M+ changed LOC found that the
 * "added code" rate nearly doubled and "updated code" rate dropped
 * since Copilot. A common AI failure mode is leaving console.log
 * debug statements in committed code (the AI "explains" its
 * reasoning to itself via console.log, but doesn't remove them).
 *
 * Per LobeChat code review (2024-2025), the project accumulated
 * 400+ console.log statements over 6 months, ~80% of which were
 * AI-generated debug noise.
 *
 * The pattern: ≥ 10 `console.log` (or other console.* / debugger)
 * statements in a single file, 0 import of a structured logger
 * (winston, pino, bunyan, debug).
 *
 * * Calibrated as DORMANT until v10.2 corpus calibration
 * confirms the FPR stays below 0.5% on the full 576,750-file corpus.
 * Code is correct and the rule is wired in the registry; it just
 * needs a positive-vs-negative precision/recall pass on v10 data. *
 */
const CONSOLE_RE = /\bconsole\s*\.\s*(?:log|debug|info|warn|error)\s*\(/g;
const DEBUGGER_RE = /\bdebugger\s*;?/g;

const STRUCTURED_LOGGERS = [
  'winston',
  'pino',
  'pino-pretty',
  'bunyan',
  'loglevel',
  'npmlog',
  'debug',
  '@debug',
  'consola',
  'signale',
  'tslog',
  'roarr',
  'logger',
];
const IMPORT_RE = /import\s+.*?from\s+['"]([^'"]+)['"]/g;
const REQUIRE_RE = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

const MIN_CONSOLE_CALLS = 10;
const MIN_FILE_SIZE = 1000;  // don't fire on tiny files

export const aiConsoleDebugStormRule = createRule<RuleContext>({
  id: 'ai/console-debug-storm',
  category: 'ai',
  severity: 'low',
  aiSpecific: true,
  description: '≥10 console.log/debug/info/warn/error + debugger statements, no structured logger — GitClear 2025 (AI debug noise often left in)',
  create(context) {
    return context;
  },
  analyze(_context, facts): Issue[] {
    if (!facts.v2) return [];
    const filePath = facts.filePath ?? '';
    // Skip test files (legitimately use console)
    if (/\.(?:test|spec)\.[jt]sx?$/i.test(filePath)) return [];
    // Skip logging utilities themselves
    if (/(?:logger|logging|debug|util)\.[jt]sx?$/i.test(filePath)) return [];
    const source = facts.v2._source ?? '';
    if (!source || source.length < MIN_FILE_SIZE) return [];

    const consoleCount = (source.match(CONSOLE_RE) || []).length;
    const debuggerCount = (source.match(DEBUGGER_RE) || []).length;
    const totalDebug = consoleCount + debuggerCount;

    if (totalDebug < MIN_CONSOLE_CALLS) return [];

    // Check for structured logger
    const imports = new Set<string>();
    for (const m of source.matchAll(IMPORT_RE)) {
      if (m[1]) imports.add(m[1]);
    }
    for (const m of source.matchAll(REQUIRE_RE)) {
      if (m[1]) imports.add(m[1]);
    }
    const hasLogger = Array.from(imports).some((spec) =>
      STRUCTURED_LOGGERS.some((lib) => spec === lib || spec.startsWith(lib + '/')),
    );
    if (hasLogger) return [];

    return [
      {
        ruleId: 'ai/console-debug-storm',
        category: 'ai',
        severity: 'low',
        aiSpecific: true,
        message:
          `${totalDebug} debug statements (${consoleCount} console.* + ${debuggerCount} debugger), ` +
          `no structured logger import. ` +
          `GitClear 2025: AI-generated code has 4× higher code churn rate; ` +
          `console.log statements are a major contributor (often left in by AI "thinking out loud").`,
        line: 1,
        column: 1,
        advice:
          'Replace console.log with a structured logger (winston, pino, debug, consola). ' +
          'Remove the debugger statements. AI often emits console.log to "explain" its reasoning ' +
          'but leaves them in committed code — review and remove.',
      },
    ];
  },
});

export default aiConsoleDebugStormRule satisfies Rule<RuleContext>;
