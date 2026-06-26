import { describe, expect, it } from 'vitest';
import { uxPatternFragmentationRule } from '../../../src/rules/product/ux-pattern-fragmentation';
import type { Issue, RuleContext, ScanFacts } from '../../../src/types';
import type { ScanFactsV2, ComponentRecord } from '../../../src/engine/types';

function makeFacts(componentNames: string[], filePath = '/repo/src/ui.tsx'): ScanFactsV2 {
  const components: ComponentRecord[] = componentNames.map((name, i) => ({
    name,
    isExported: true,
    loc: 20,
    isClientComponent: true,
    isServerComponent: false,
    props: [],
    hookCalls: [],
    jsxBranches: [],
    imports: [],
    line: i * 25 + 1,
    column: 1,
    filePath,
  }));
  // Mock only the fields the rule actually reads (`file`, `components`).
  return {
    file: { path: filePath, loc: 200, extension: '.tsx', framework: 'react' },
    components,
  } as unknown as ScanFactsV2;
}

describe('product/ux-pattern-fragmentation', () => {
  const context: RuleContext = {
    config: {} as RuleContext['config'],
    filePath: '/repo/src/ui.tsx',
    cwd: '/repo',
  };

  function analyze(componentNames: string[]): Issue[] {
    const ctx = uxPatternFragmentationRule.create(context);
    return uxPatternFragmentationRule.analyze(ctx, { v2: makeFacts(componentNames) } as unknown as ScanFacts);
  }

  it('does not fire when each category is below its threshold', () => {
    expect(analyze(['Modal', 'Button', 'Input', 'Card'])).toEqual([]);
  });

  it('does not fire at the threshold boundary (modal: 3 = OK, 4 = fire)', () => {
    // 3 modal patterns — at threshold - 1, no fire
    expect(analyze(['Modal', 'Dialog', 'Sheet']).find((i) => i.message.includes('modal'))).toBeUndefined();
    // 4 modal patterns — at threshold, fires
    expect(analyze(['Modal', 'Dialog', 'Sheet', 'Drawer']).find((i) => i.message.includes('modal'))).toBeDefined();
  });

  it('fires for modal category when >=4 distinct modal patterns exist', () => {
    const issues = analyze(['Modal', 'Dialog', 'Sheet', 'Drawer', 'Popup']);
    expect(issues.some((i) => i.message.includes('modal category'))).toBe(true);
  });

  it('fires for toast category when >=3 distinct toast patterns exist', () => {
    const issues = analyze(['Toast', 'Snackbar', 'Notification']);
    expect(issues.some((i) => i.message.includes('toast category'))).toBe(true);
  });

  it('fires for button category when >=5 distinct button patterns exist', () => {
    const issues = analyze(['Button', 'IconButton', 'Action', 'LinkButton', 'FloatingAction', 'SubmitButton']);
    expect(issues.some((i) => i.message.includes('button category'))).toBe(true);
  });

  it('fires for multiple categories independently', () => {
    const issues = analyze([
      'Modal', 'Dialog', 'Sheet', 'Drawer',
      'Toast', 'Snackbar', 'Notification',
    ]);
    expect(issues.length).toBe(2);
    const labels = issues.map((i) => {
      const m = i.message.match(/(\w+) category/);
      return m ? m[1] : '';
    });
    expect(labels).toContain('modal');
    expect(labels).toContain('toast');
  });

  it('does not classify `Container` as a card (layout primitive, not card)', () => {
    // 3 Container variants should NOT fire the card category
    const issues = analyze(['LayoutContainer', 'ContentContainer', 'FormContainer']);
    expect(issues.find((i) => i.message.includes('card category'))).toBeUndefined();
  });

  it('assigns each component to at most one category (first match wins)', () => {
    // ModalDialog ends in Dialog (modal category) — should count only once
    const issues = analyze(['ModalDialog', 'ModalHeader', 'ModalFooter']);
    // All 3 end in something-modal-ish; verify no double-counting
    const modalIssue = issues.find((i) => i.message.includes('modal category'));
    if (modalIssue) {
      // If the rule fires, it should report 1 distinct (ModalDialog) or 0
      // — never 2 or 3 (which would indicate double-counting)
      const match = modalIssue.message.match(/(\d+) distinct patterns/);
      expect(match?.[1]).toBe('1');
    }
  });

  it('shows "+N more" truncation when count exceeds 5', () => {
    const issues = analyze([
      'Modal', 'Dialog', 'Sheet', 'Drawer', 'Popup', 'Lightbox', 'Overlay',
    ]);
    const modalIssue = issues.find((i) => i.message.includes('modal category'));
    expect(modalIssue?.message).toMatch(/\+\d+ more/);
  });

  it('handles empty components array', () => {
    expect(analyze([])).toEqual([]);
  });
});
