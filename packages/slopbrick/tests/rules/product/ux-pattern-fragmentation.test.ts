import { describe, expect, it } from 'vitest';
import { uxPatternFragmentationRule } from '../../../src/rules/product/ux-pattern-fragmentation';
import type { RuleContext, ScanFacts } from '../../../src/types';
import type { ScanFactsV2 } from '../../../src/engine/types';

function makeFacts(componentNames: string[], filePath = '/repo/src/ui.tsx'): ScanFacts {
  return {
    file: { path: filePath, loc: 200, extension: '.tsx', framework: 'react' },
    components: componentNames.map((name, i) => ({
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
    })),
    imports: [],
    jsxElements: [],
    jsxTree: [],
    hooks: [],
    stateVariables: [],
    defensiveChecks: [],
    apiCalls: [],
    designTokens: {
      spacing: { used: [], scale: [] },
      radius: { used: [], scale: [] },
      fontFamily: { used: [], scale: [] },
      fontSize: { used: [], scale: [] },
      color: { used: [], scale: [] },
    },
    cssClasses: [],
    cssVars: [],
    cssInline: [],
    htmlAttributes: [],
    mathConstants: [],
    comments: [],
    tailwindClasses: [],
    astroComponents: [],
    svelteComponents: [],
    vueComponents: [],
    qwikComponents: [],
    reactServerComponents: [],
    componentSizes: [],
    typeAnnotations: [],
    boundaryViolations: [],
    stateMutationPatterns: [],
    consoleLogs: [],
    testMocks: [],
    fileMeta: { path: filePath, loc: 200, extension: '.tsx', framework: 'react' },
  } as unknown as ScanFactsV2;
}

describe('product/ux-pattern-fragmentation', () => {
  const context: RuleContext = {
    config: {} as RuleContext['config'],
    filePath: '/repo/src/ui.tsx',
    cwd: '/repo',
  };

  it('does not fire when each category is below its threshold', () => {
    const ctx = uxPatternFragmentationRule.create(context);
    const issues = uxPatternFragmentationRule.analyze(ctx, {
      v2: makeFacts(['Modal', 'Button', 'Input', 'Card']),
    } as ScanFacts);
    expect(issues).toEqual([]);
  });

  it('fires for modal category when >=4 distinct modal patterns exist', () => {
    const ctx = uxPatternFragmentationRule.create(context);
    const issues = uxPatternFragmentationRule.analyze(ctx, {
      v2: makeFacts(['Modal', 'Dialog', 'Sheet', 'Drawer', 'Popup']),
    } as ScanFacts);
    expect(issues.some((i) => i.message.includes('modal category'))).toBe(true);
  });

  it('fires for toast category when >=3 distinct toast patterns exist', () => {
    const ctx = uxPatternFragmentationRule.create(context);
    const issues = uxPatternFragmentationRule.analyze(ctx, {
      v2: makeFacts(['Toast', 'Snackbar', 'Notification']),
    } as ScanFacts);
    expect(issues.some((i) => i.message.includes('toast category'))).toBe(true);
  });

  it('fires for multiple categories independently', () => {
    const ctx = uxPatternFragmentationRule.create(context);
    const issues = uxPatternFragmentationRule.analyze(ctx, {
      v2: makeFacts([
        'Modal', 'Dialog', 'Sheet', 'Drawer',
        'Toast', 'Snackbar', 'Notification',
      ]),
    } as ScanFacts);
    expect(issues.length).toBe(2);
    const labels = issues.map((i) => {
      const m = i.message.match(/(\w+) category/);
      return m ? m[1] : '';
    });
    expect(labels).toContain('modal');
    expect(labels).toContain('toast');
  });

  it('does not double-count same component name in two categories', () => {
    const ctx = uxPatternFragmentationRule.create(context);
    const issues = uxPatternFragmentationRule.analyze(ctx, {
      v2: makeFacts(['ModalButton', 'ModalFooter', 'ModalHeader']),
    } as ScanFacts);
    expect(issues.find((i) => i.message.includes('modal category'))).toBeUndefined();
  });
});
