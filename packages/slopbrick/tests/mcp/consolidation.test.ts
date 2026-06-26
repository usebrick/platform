import { describe, expect, it } from 'vitest';
import {
  canonicalToolNames,
  getDeprecation,
  TOOL_DEFINITIONS,
} from '../../src/mcp/tools';

describe('MCP tool consolidation (v0.11.2)', () => {
  it('exposes the four canonical tools plus two unique-purpose ones', () => {
    const canonical = canonicalToolNames();
    // The four core tools from the v0.9.x consolidation plan
    expect(canonical).toContain('slop_suggest');
    expect(canonical).toContain('slop_scan_file');
    expect(canonical).toContain('slop_check_constitution');
    expect(canonical).toContain('slop_explain_rule');
    // Discovery + GIR are unique-purpose, not narrow-axis collapses
    expect(canonical).toContain('slop_list_rules');
    expect(canonical).toContain('slop_find_similar');
  });

  it('marks slop_suggest_with_memory as canonical (the fast-path variant)', () => {
    // slop_suggest_with_memory is the preferred path on warm cache; it
    // is NOT a narrow axis collapse, it's a perf-optimized twin of
    // slop_suggest.
    expect(getDeprecation('slop_suggest_with_memory')).toBeUndefined();
    expect(canonicalToolNames()).toContain('slop_suggest_with_memory');
  });

  it('deprecates slop_governance in favor of slop_suggest', () => {
    const dep = getDeprecation('slop_governance');
    expect(dep).toBeDefined();
    expect(dep?.replacedBy).toBe('slop_suggest');
    expect(dep?.removedIn).toBe('0.13.0');
  });

  it('deprecates slop_architecture_score in favor of slop_suggest', () => {
    const dep = getDeprecation('slop_architecture_score');
    expect(dep).toBeDefined();
    expect(dep?.replacedBy).toBe('slop_suggest');
    expect(dep?.removedIn).toBe('0.13.0');
  });

  it('deprecates slop_business_logic_score in favor of slop_suggest', () => {
    const dep = getDeprecation('slop_business_logic_score');
    expect(dep).toBeDefined();
    expect(dep?.replacedBy).toBe('slop_suggest');
    expect(dep?.removedIn).toBe('0.13.0');
  });

  it('does NOT remove deprecated tools from TOOL_DEFINITIONS yet (backward compat through v0.12.x)', () => {
    const deprecated = TOOL_DEFINITIONS.filter((t) => t.deprecated).map((t) => t.name);
    expect(deprecated).toEqual(
      expect.arrayContaining([
        'slop_governance',
        'slop_architecture_score',
        'slop_business_logic_score',
      ]),
    );
    // They still appear in the schema so old MCP clients keep working
    expect(TOOL_DEFINITIONS.map((t) => t.name)).toEqual(
      expect.arrayContaining(deprecated),
    );
  });

  it('canonicalToolNames() excludes deprecated tools', () => {
    const canonical = canonicalToolNames();
    expect(canonical).not.toContain('slop_governance');
    expect(canonical).not.toContain('slop_architecture_score');
    expect(canonical).not.toContain('slop_business_logic_score');
  });

  it('returns undefined for unknown tool names', () => {
    expect(getDeprecation('not_a_real_tool')).toBeUndefined();
    expect(getDeprecation('slop_suggest')).toBeUndefined();
  });

  it('all deprecated tools route to a canonical tool that exists', () => {
    const canonical = new Set(canonicalToolNames());
    for (const tool of TOOL_DEFINITIONS) {
      if (tool.deprecated) {
        expect(canonical.has(tool.deprecated.replacedBy)).toBe(true);
      }
    }
  });

  it('deprecation description mentions the replacement tool', () => {
    for (const tool of TOOL_DEFINITIONS) {
      if (tool.deprecated) {
        expect(tool.description).toContain(tool.deprecated.replacedBy);
        expect(tool.description).toMatch(/DEPRECATED/i);
      }
    }
  });
});
