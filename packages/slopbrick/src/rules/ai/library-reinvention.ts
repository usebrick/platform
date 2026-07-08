import type { Issue, Rule, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';

/**
 * AI library reinvention detection.
 *
 * Per GitClear (2025), "AI Copilot Code Quality: 2024's Increased
 * Defect Rate" — analysis of 150M+ LOC found code churn rate
 * increased 4× since Copilot (2022). "Added code" rate nearly
 * doubled while "updated code" rate dropped. Reinvented libraries
 * (custom date pickers, charts, form validators) are a major
 * contributor — they get replaced when the team realizes the
 * canonical library exists.
 *
 * Per Cui et al. (2025), "Who is using AI to code?" — 30.1% of new
 * Python functions in the US are AI-generated (Dec 2024), and the
 * rate is rising. As AI's share grows, the "reinvent the wheel"
 * pattern becomes more visible.
 *
 * The pattern: a file contains ≥ 2 of these reinvented shapes AND
 * does NOT import the canonical library. Each shape is a strong
 * "AI would generate this; use a library instead" signal.
 *
 * * Calibrated as DORMANT until v10.2 corpus calibration
 * confirms the FPR stays below 0.5% on the full 576,750-file corpus.
 * Code is correct and the rule is wired in the registry; it just
 * needs a positive-vs-negative precision/recall pass on v10 data. *
 */
interface ReinventedPattern {
  name: string;
  library: string;
  re: RegExp;
  description: string;
}

const REINVENTED_PATTERNS: ReinventedPattern[] = [
  {
    name: 'date-picker',
    library: 'react-day-picker / date-fns',
    // <input type="date"> with manual onChange
    re: /<input[^>]*\btype\s*=\s*["']date["'][^>]*>/,
    description: 'hand-rolled <input type="date"> with manual format/parse',
  },
  {
    name: 'form-validation',
    library: 'react-hook-form + zod',
    // Manual field validation: if (!field) errors.field = "..."
    re: /if\s*\(\s*!\s*\w[\w.]*\s*\)\s*errors\.\w+\s*=\s*['"]/,
    description: 'manual field validation `if (!x) errors.x = "..."`',
  },
  {
    name: 'chart',
    library: 'recharts / chart.js / d3',
    // SVG <path d="M..." with multiple line commands (bar/line chart shape)
    re: /<path\s+d\s*=\s*["']M\d/,
    description: 'hand-rolled SVG chart with <path d="M...">',
  },
  {
    name: 'modal',
    library: '@radix-ui/react-dialog / shadcn Dialog',
    // Tailwind fixed-position modal pattern
    re: /\bfixed\s+inset-0\s+z-50\b/,
    description: 'hand-rolled modal with `fixed inset-0 z-50`',
  },
  {
    name: 'toast',
    library: 'sonner / react-hot-toast',
    // setTimeout-based auto-dismiss notification
    re: /setTimeout\s*\(\s*[^,]+,\s*[2-9]\d{3,}\s*\)/,
    description: 'setTimeout-based notification with long delay',
  },
  {
    name: 'tabs',
    library: 'shadcn Tabs / @radix-ui/react-tabs',
    // Manual tabs: useState('tab1') + conditional render
    re: /useState\s*\(\s*['"][a-z-]+['"]\s*\)\s*;[\s\S]{0,500}active\s*===\s*['"][a-z-]+['"]/,
    description: 'manual tabs with useState string + conditional render',
  },
  {
    name: 'select',
    library: 'shadcn Select / @radix-ui/react-select',
    // Hand-rolled dropdown: <select onChange={...}> without a wrapper
    re: /<select\s+onChange\s*=\s*\{/,
    description: 'hand-rolled <select> with raw onChange (no combobox)',
  },
  {
    name: 'accordion',
    library: 'shadcn Accordion / @radix-ui/react-accordion',
    // Manual accordion with isOpen state
    re: /useState\s*\(\s*(?:false|true)\s*\)[\s\S]{0,200}onClick\s*=\s*\{\s*\(\s*\)\s*=>\s*set\w+\(\s*!\w+\s*\)\s*\}/,
    description: 'manual accordion with useState boolean + onClick toggle',
  },
];

const CANONICAL_LIBRARIES = [
  'react-day-picker',
  'react-datepicker',
  'date-fns',
  'dayjs',
  'luxon',
  'moment',
  'react-hook-form',
  'formik',
  'zod',
  'yup',
  'joi',
  'recharts',
  'chart.js',
  'react-chartjs-2',
  'd3',
  'victory',
  'nivo',
  '@radix-ui',
  'shadcn',
  'sonner',
  'react-hot-toast',
  'react-toastify',
  'notistack',
];

const IMPORT_LINE_RE = /import\s+.*?from\s+['"]([^'"]+)['"]/g;
const REQUIRE_RE = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
const MIN_PATTERNS = 2;

export const aiLibraryReinventionRule = createRule<RuleContext>({
  id: 'ai/library-reinvention',
  category: 'ai',
  severity: 'medium',
  aiSpecific: true,
  // v0.20.0 calibration: v8.5 verdict = USEFUL but recall 0.000
  // (fires never on the corpus). The "≥2 reinvented patterns"
  // threshold is too strict. Disable until rewritten.
  defaultOff: true,
  description: 'File reinvents ≥2 common patterns (date picker, form validation, chart, modal, etc.) without importing the canonical library — GitClear 2025 + Cui et al. 2025',
  create(context) {
    return context;
  },
  analyze(_context, facts): Issue[] {
    if (!facts.v2) return [];
    const filePath = facts.filePath ?? '';
    // Only fire on frontend files
    if (!/\.(?:ts|tsx|js|jsx|vue|svelte|astro|html)$/i.test(filePath)) return [];
    const source = facts.v2._source ?? '';
    if (!source) return [];

    // Collect all imported package names
    const imports = new Set<string>();
    for (const m of source.matchAll(IMPORT_LINE_RE)) {
      if (m[1]) imports.add(m[1]);
    }
    for (const m of source.matchAll(REQUIRE_RE)) {
      if (m[1]) imports.add(m[1]);
    }

    // If the file already imports any canonical library, no reinvention concern
    const hasCanonical = Array.from(imports).some((spec) =>
      CANONICAL_LIBRARIES.some((lib) => spec === lib || spec.startsWith(lib + '/')),
    );
    if (hasCanonical) return [];

    // Count reinvented patterns
    const matched: string[] = [];
    for (const pattern of REINVENTED_PATTERNS) {
      if (pattern.re.test(source)) {
        matched.push(pattern.name);
      }
    }

    if (matched.length < MIN_PATTERNS) return [];

    return [
      {
        ruleId: 'ai/library-reinvention',
        category: 'ai',
        severity: 'medium',
        aiSpecific: true,
        message:
          `File reinvents ${matched.length} common patterns without canonical library: ` +
          `${matched.join(', ')}. ` +
          `GitClear 2025: AI code has 4× higher churn rate (typically replaced when ` +
          `the team realizes the library exists). Cui et al. 2025: 30.1% of new code ` +
          `is AI-generated, making this pattern increasingly common.`,
        line: 1,
        column: 1,
        advice:
          `Use canonical libraries instead: ` +
          matched.map((m) => {
            const p = REINVENTED_PATTERNS.find((x) => x.name === m);
            return `${m} → ${p?.library ?? '?'}`;
          }).join('; ') +
          `. Custom implementations are typically less accessible, less tested, and have higher maintenance burden.`,
      },
    ];
  },
});

export default aiLibraryReinventionRule satisfies Rule<RuleContext>;
