// Rule: test/duplicate-setup
//
// Catches repeated `beforeEach` / `beforeAll` / `afterEach` /
// `setupServer(...)` blocks within a single file. When AI agents
// generate tests, they often copy-paste the same `renderWithProviders`
// or `setupServer` setup across every `describe` block.
//
// v1 ships intra-file detection only. Inter-file correlation requires
// a per-run hash map stashed in RuleContext and a separate scan
// pass — deferred to a follow-up commit.
//
// Detection: regex over `_source` to extract the bodies of
// `beforeEach/beforeAll/afterEach/setupServer(...)`. Each body's
// whitespace + identifier names are normalized → SHA-1 hash. If 3+
// blocks in the same file share a hash, fire one issue per duplicate.
//
// Severity: medium. aiSpecific: true.
//
// FP guards:
//   - Skip blocks < 3 lines (trivially short).
//   - Only fire when the duplicated body contains a non-trivial line
//     (render / setupServer / jest.mock / vi.mock).

import type { Issue, Rule, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';
import { extractSetupBlocks, isTestFile, type SetupBlockHit } from './utils';

export interface DuplicateSetupContext {
  /** Per-run registry: source-hash → list of (file, line) occurrences. */
  // Reserved for the inter-file phase; unused in v1.
}

const DUPLICATE_THRESHOLD = 3;

export const duplicateSetupRule = createRule<DuplicateSetupContext>({
  id: 'test/duplicate-setup',
  category: 'test',
  severity: 'medium',
  aiSpecific: true,
  description:
    'Repeated beforeEach/beforeAll/setupServer blocks within the same file. Extract to a helper.',
  create(): DuplicateSetupContext {
    return {};
  },
  analyze(_context, facts: ScanFacts): Issue[] {
    const issues: Issue[] = [];
    if (!isTestFile(facts.v2.file.path)) return issues;
    const source = facts.v2._source;
    if (!source) return issues;

    const blocks = extractSetupBlocks(source, 3);
    if (blocks.length < DUPLICATE_THRESHOLD) return issues;

    // Group by hash.
    const groups = new Map<string, SetupBlockHit[]>();
    for (const block of blocks) {
      const list = groups.get(block.bodyHash) ?? [];
      list.push(block);
      groups.set(block.bodyHash, list);
    }

    // Fire for every group with 3+ occurrences. The plan also recommends
    // skipping trivially-different setups (no render / setupServer /
    // jest.mock line) — those are usually harmless one-liners.
    for (const [hash, list] of groups) {
      if (list.length < DUPLICATE_THRESHOLD) continue;
      const firstBody = list[0]?.rawBody ?? '';
      if (!hasNonTrivialSetupLine(firstBody)) continue;
      for (const block of list) {
        const otherLines = list
          .filter((b) => b !== block)
          .map((b) => b.line)
          .join(', ');
        issues.push({
          ruleId: 'test/duplicate-setup',
          category: 'test',
          severity: 'medium',
          aiSpecific: true,
          message:
            `Duplicate ${block.kind} block at line ${block.line} ` +
            `(also at lines ${otherLines}, hash ${hash.slice(0, 8)}). ` +
            `Extract to a helper (e.g. 'const renderWithProviders = ...').`,
          line: block.line,
          column: block.column,
          advice:
            'Move shared setup into a helper at the top of the file and call it from each describe block. ' +
            'If 5+ files duplicate the same setup, extract it to a shared test-utils module.',
        });
      }
    }
    return issues;
  },
});

/**
 * True when the body contains at least one non-trivial setup line:
 * `render(`, `setupServer(`, `jest.mock(`, `vi.mock(`, `mount(`.
 * Filters out trivial blocks (no real setup to consolidate).
 */
function hasNonTrivialSetupLine(body: string): boolean {
  return /(render|setupServer|jest\.mock|vi\.mock|mount|cleanup|act\s*\()/i.test(body);
}

export default duplicateSetupRule satisfies Rule<DuplicateSetupContext>;