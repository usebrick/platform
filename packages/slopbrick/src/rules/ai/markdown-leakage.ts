import type { Issue, Rule, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';

/**
 * AI markdown language-marker leakage.
 *
 * Per Yotkova et al. (SemEval-2026 Task 13, arXiv:2605.04157):
 *   "Standalone language-name line preceding the snippet (e.g.,
 *    `python`, `java`) mimics Markdown fenced-block format."
 *
 * The pattern is essentially absent in human-written code. AI tools
 * (especially in chat-style prompts) often emit a bare language
 * identifier on its own line before a fenced code block, OR copy-
 * paste the language marker into a code file as a stray comment /
 * shebang. Pattern fires on ~5k/500k examples in the SemEval corpus
 * with 99.9% specificity for human code.
 *
 * Examples of fire:
 *   ```python        <- on its own line (top of file)
 *   def foo():
 *
 *   ```js
 *   const x = 1;
 *
 *   python           <- stray language name as first non-blank line
 *   import os
 *
 * We also catch:
 *   - Leading ```` ```<lang> ```` on its own line in a non-markdown
 *     file (TS/JS/Python file with the fence as first content)
 *   - Bare language name (python|javascript|typescript|java|go|rust|
 *     cpp|c\+\+|c#|ruby|php|kotlin|swift|scala) on first 3 lines with
 *     no other content.
 *
 * Lift in Yotkova's data: ≥10× (P≈1.0 on clean files, R low because
 * the signal is rare but very specific).
 */
const LANG_NAMES = [
  'python', 'python3', 'py',
  'javascript', 'typescript', 'js', 'ts', 'jsx', 'tsx',
  'java',
  'go', 'golang',
  'rust', 'rs',
  'c', 'cpp', 'c++', 'cxx', 'cc',
  'c#', 'csharp', 'cs',
  'ruby', 'rb',
  'php',
  'kotlin', 'kt',
  'swift',
  'scala',
  'html', 'css', 'scss', 'sass', 'less',
  'sql',
  'bash', 'sh', 'shell', 'zsh',
  'powershell', 'ps1',
  'json', 'yaml', 'yml', 'toml', 'xml',
  'markdown', 'md',
];

// Match ```<lang> on its own line (fence-only line, possibly with whitespace)
const FENCE_ONLY_RE = /^\s*```\s*([a-zA-Z+#][a-zA-Z0-9+#-]*)?\s*$/;

// Match bare language name on its own line (must be ONLY the name + whitespace)
const BARE_LANG_RE = new RegExp(
  `^\\s*(${LANG_NAMES.map((n) => n.replace(/[+#.]/g, '\\$&')).join('|')})\\s*$`,
  'i',
);

const MAX_LINES_TO_CHECK = 5;

export const aiMarkdownLeakageRule = createRule<RuleContext>({
  id: 'ai/markdown-leakage',
  category: 'ai',
  severity: 'high',
  aiSpecific: true,
  description: 'Stray Markdown fence or bare language name at top of file — AI tools leak the fenced-block format into code',
  create(context) {
    return context;
  },
  analyze(_context, facts): Issue[] {
    if (!facts.v2) return [];
    const source = facts.v2._source ?? '';
    if (!source) return [];

    const lines = source.split('\n');
    if (lines.length === 0) return [];

    const issues: Issue[] = [];

    // Look at the first few non-blank lines.
    let checked = 0;
    for (let i = 0; i < Math.min(lines.length, MAX_LINES_TO_CHECK + 2); i++) {
      const line = lines[i] ?? '';
      if (line.trim() === '') continue;
      checked++;
      if (checked > MAX_LINES_TO_CHECK) break;

      // Match fence-only line: ```python (with optional language)
      const fenceMatch = FENCE_ONLY_RE.exec(line);
      if (fenceMatch) {
        const lang = fenceMatch[1] ?? '';
        // Only flag if the next non-blank line looks like code (heuristic:
        // it has at least one identifier-like char and isn't itself a fence).
        const nextNonBlank = lines.slice(i + 1).find((l) => l.trim() !== '');
        if (nextNonBlank && !FENCE_ONLY_RE.test(nextNonBlank) && /[a-zA-Z0-9_=(){}\[\];]/.test(nextNonBlank)) {
          issues.push({
            ruleId: 'ai/markdown-leakage',
            category: 'ai',
            severity: 'high',
            aiSpecific: true,
            message:
              `Stray Markdown fence at line ${i + 1} (\`\`\`${lang}\`) — AI tools often leak the fenced-block format ` +
              `from chat output into standalone code files. Remove the fence.`,
            line: i + 1,
            column: 1,
            advice:
              'Delete the `\\`\\`\\`<lang>\\`\\`\\`` line; it is a Markdown code-block marker, not valid syntax in a ' +
              (facts.filePath?.endsWith('.md') ? 'standalone Markdown file (fences need closing).' : 'source code file.'),
          });
          break;
        }
      }

      // Match bare language name (e.g., just "python" on its own line)
      if (BARE_LANG_RE.test(line)) {
        // Must be followed by code-like content within next 2 non-blank lines
        const upcoming = lines.slice(i + 1, i + 6).filter((l) => l.trim() !== '').slice(0, 2);
        if (upcoming.length > 0 && upcoming.some((l) => /[a-zA-Z]{3,}/.test(l) && /[=({:]/.test(l))) {
          issues.push({
            ruleId: 'ai/markdown-leakage',
            category: 'ai',
            severity: 'high',
            aiSpecific: true,
            message:
              `Bare language name on line ${i + 1} (\`${line.trim()}\`) — looks like a leaked Markdown language tag. ` +
              `AI chat outputs often emit \`python\` / \`javascript\` / etc. as a heading before the code.`,
            line: i + 1,
            column: 1,
            advice:
              'Remove the bare language name; if it is meant as a comment, prefix it with `#` (Python) or `//` (JS/TS/Java/Go/Rust).',
          });
          break;
        }
      }
    }

    return issues;
  },
});

export default aiMarkdownLeakageRule satisfies Rule<RuleContext>;
