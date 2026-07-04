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

  it('marks slop_suggest_with_structure as canonical (the fast-path variant)', () => {
    // slop_suggest_with_memory is the preferred path on warm cache; it
    // is NOT a narrow axis collapse, it's a perf-optimized twin of
    // slop_suggest.
    expect(getDeprecation('slop_suggest_with_structure')).toBeUndefined();
    expect(canonicalToolNames()).toContain('slop_suggest_with_structure');
  });

  it('removed slop_governance in v0.39.0 (was deprecated since v0.11.2)', () => {
    // v0.39.0: the 3 deprecated tools (slop_governance,
    // slop_architecture_score, slop_business_logic_score) were
    // finally removed. They had been marked for removal in v0.13.0
    // but lingered in TOOL_DEFINITIONS through v0.12.x for backward
    // compat. v0.39.0 retires them — users should call slop_suggest
    // and read repositoryHealth / architectureConsistency /
    // businessLogicCoherence from the response.
    //
    // getDeprecation returns undefined for unknown tools (the tool
    // no longer exists in the registry), which is the right answer:
    // there is nothing to deprecate, the tool is just gone.
    expect(getDeprecation('slop_governance')).toBeUndefined();
    // And it does NOT appear in TOOL_DEFINITIONS anymore.
    expect(TOOL_DEFINITIONS.find((t) => t.name === 'slop_governance')).toBeUndefined();
  });

  it('removed slop_architecture_score in v0.39.0 (was deprecated since v0.11.2)', () => {
    expect(getDeprecation('slop_architecture_score')).toBeUndefined();
    expect(
      TOOL_DEFINITIONS.find((t) => t.name === 'slop_architecture_score'),
    ).toBeUndefined();
  });

  it('removed slop_business_logic_score in v0.39.0 (was deprecated since v0.11.2)', () => {
    expect(getDeprecation('slop_business_logic_score')).toBeUndefined();
    expect(
      TOOL_DEFINITIONS.find((t) => t.name === 'slop_business_logic_score'),
    ).toBeUndefined();
  });

  it('no deprecated tools remain in TOOL_DEFINITIONS (v0.39.0)', () => {
    // The pre-v0.39.0 contract was "deprecated tools stay in
    // TOOL_DEFINITIONS for backward compat through v0.12.x". v0.39.0
    // ends that — every deprecated tool was retired in this release.
    const deprecated = TOOL_DEFINITIONS.filter((t) => t.deprecated).map((t) => t.name);
    expect(deprecated).toEqual([]);
  });

  it('canonicalToolNames() excludes the removed tools', () => {
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
