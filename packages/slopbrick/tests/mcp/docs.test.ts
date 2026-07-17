import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { TOOL_DEFINITIONS } from '../../src/mcp/tools';
import { verifyMcpDocsDocument } from '../../scripts/generate-mcp-docs';

const docsPath = join(__dirname, '..', '..', 'docs', 'MCP.md');

describe('MCP documentation registry contract', () => {
  it('matches TOOL_DEFINITIONS without requiring a generated monolithic doc', () => {
    const document = readFileSync(docsPath, 'utf8');
    expect(verifyMcpDocsDocument(document)).toBe(document);
  });

  it('documents every canonical runtime tool section', () => {
    const document = readFileSync(docsPath, 'utf8');
    for (const tool of TOOL_DEFINITIONS.filter((entry) => !entry.deprecated)) {
      expect(document).toContain(`#### \`${tool.name}\``);
    }
  });

  it('does not advertise a closed category list for slop_list_rules', () => {
    const listRules = TOOL_DEFINITIONS.find((tool) => tool.name === 'slop_list_rules');

    expect(listRules?.description).toContain('any registered category');
    expect(listRules?.description).not.toContain('visual | logic | wcag');
  });

  it('does not publish an unmeasured fixed latency multiplier', () => {
    const structuredSuggest = TOOL_DEFINITIONS.find(
      (tool) => tool.name === 'slop_suggest_with_structure',
    );

    expect(structuredSuggest?.description).toContain('measure the speed-up');
    expect(structuredSuggest?.description).not.toMatch(/\d+[–-]\d+×/);
  });

  it('documents optional bounded finding evidence without parser dumps or provenance claims', () => {
    const document = readFileSync(docsPath, 'utf8');
    expect(document).toContain('optional bounded `whyItFired.evidence`');
    expect(document).toContain('exact matched source span');
    expect(document).toContain('bounded top-level `calibration`');
    expect(document).toContain('`provenance.source` and');
    expect(document).not.toContain('parser fact tree');
    expect(document).not.toContain('authorship provenance');
  });
});
