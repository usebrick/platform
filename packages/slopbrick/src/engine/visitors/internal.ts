// Internal types shared between visitor.ts and visitors/*.ts.
// Extracted to break the otherwise-circular import that would result
// from dispatch.ts importing types out of visitor.ts directly.

import type {
  ComponentFacts,
  HookFact,
  StateBinding,
  PropPassThroughFact,
} from '../../types';
import type { AnyNode } from './react.js';

/**
 * The internal flat-style accumulator used by `extractFacts()`. Powers
 * the v2 build at the bottom of visitor.ts but is NOT exposed on the
 * returned `ScanFacts`. See `engine/types.ts` → `ScanFactsV2` for the
 * public grouped shape that rules consume.
 */
export interface InternalFacts {
  filePath: string;
  components: ComponentFacts[];
  staticClassNames: Array<{ value: string; line: number; column: number }>;
  allElements: any[];
  imports: any[];
  hooks: any[];
  logicalExpressions: any[];
  styleProps: Array<{ source: string; line: number; column: number }>;
  keyProps: any[];
  componentSizes: any[];
  astroComponents: any[];
  fetchCalls: any[];
  optimisticUpdates: any[];
  /**
   *  dead-code detector. Populated by the visitor's identifier walk +
   *  import/branch/return handlers. See `engine/types.ts` →
   *  `BindingRecord` for the per-binding shape and `DeadCodeFacts` for
   *  the full domain. Rules consume `facts.v2.deadCode`, not this
   *  internal accumulator. */
  deadCode: import('../types').DeadCodeFacts;
  /**
   *  referenced-name set, populated alongside the binding list. A
   *  binding whose name is missing from this set is unused. Reset
   *  per file inside `extractFacts`. */
  referencedNames: Set<string>;
}

/**
 * Stack frame for the visitor. One per function in the current
 * lexical scope (component vs. plain helper). Frames push on enter,
 * pop on exit; `nearestComponent` walks from the top to find the
 * enclosing React component.
 *
 * Fields populated during the walk:
 *   - hookCalls:        every React hook call detected (e.g. useState, useEffect)
 *   - stateBindings:    useState destructuring `{ value, setter }` patterns
 *   - propPassThroughs: `<C prop={x} />` where x is a destructured prop
 *   - propBindings/propUsages: derived at popFrame from the Set accumulators
 */
export interface FunctionFrame extends ComponentFacts {
  isComponent: boolean;
  bindings: Set<string>;
  /**  dead-code detector. Names referenced inside this
   *  frame (set by the identifier walk). Combined with the parent
   *  frames' sets at pop time so a binding is considered used if any
   *  reachable scope references it. */
  references: Set<string>;
  propBindingSet: Set<string>;
  propUsageSet: Set<string>;
  endLine: number;
  node: AnyNode;
  /** Round 23: set when the function is wrapped in React.memo() or
   *  React.forwardRef(). Affects boundary-violation + inline-event rules. */
  isMemoWrapped?: boolean;
  hookCalls: HookFact[];
  stateBindings: StateBinding[];
  propBindings: string[];
  propPassThroughs: PropPassThroughFact[];
  propUsages: string[];
}

/**
 * Walker-scoped state. Stack of frames + bookkeeping counters for
 * `.map()` callbacks and JSX `key` propagation. See visitor.ts for
 * how each counter is incremented/decremented.
 */
export interface WalkContext {
  stack: FunctionFrame[];
  useClient: boolean;
  mapDepth: number;
  /** See visitor.ts — consumed by the first JSX after a .map() call. */
  pendingKeyChecks: number;
  /** See visitor.ts — depth of JSX elements with a `key` prop. */
  keyDepth: number;
}