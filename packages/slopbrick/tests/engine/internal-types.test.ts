// v2.0.0: smoke test for the relocated walker types. Behavior is
// unchanged — this just verifies the type modules are importable and
// expose the expected shapes. A real semantic test for the dispatch
// table is deferred to v2.0.1 once the walker is rewired.

import { describe, expect, it } from 'vitest';
import type { InternalFacts, FunctionFrame, WalkContext } from '../../src/engine/visitors/internal';
import type { ComponentFacts } from '../../src/types';

describe('visitors/internal.ts (v2.0.0 type extraction)', () => {
  it('InternalFacts shape covers all flat-style fields', () => {
    const facts: InternalFacts = {
      filePath: '/x.tsx',
      components: [],
      staticClassNames: [],
      allElements: [],
      imports: [],
      hooks: [],
      logicalExpressions: [],
      styleProps: [],
      keyProps: [],
      componentSizes: [],
      astroComponents: [],
      fetchCalls: [],
      optimisticUpdates: [],
    };
    expect(facts.filePath).toBe('/x.tsx');
    expect(facts.components).toEqual([]);
  });

  it('FunctionFrame extends ComponentFacts + walker state', () => {
    const frame: FunctionFrame = {
      // ComponentFacts fields
      name: 'MyComp',
      line: 1,
      column: 1,
      hookCalls: [],
      stateBindings: [],
      propBindings: [],
      propPassThroughs: [],
      propUsages: [],
      isServerComponent: false,
      // FunctionFrame extensions
      isComponent: true,
      bindings: new Set(['props']),
      propBindingSet: new Set(['props']),
      propUsageSet: new Set(['foo']),
      endLine: 10,
      node: {},
    };
    expect(frame.bindings.has('props')).toBe(true);
    expect(frame.isComponent).toBe(true);
  });

  it('WalkContext carries walker bookkeeping', () => {
    const ctx: WalkContext = {
      stack: [],
      useClient: false,
      mapDepth: 0,
      pendingKeyChecks: 0,
      keyDepth: 0,
    };
    expect(ctx.mapDepth).toBe(0);
    expect(ctx.useClient).toBe(false);
  });
});