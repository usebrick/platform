import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, symlinkSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  extractImports,
  categorizeImport,
  buildPatternInventory,
  checkFileConstitution,
} from '../../src/mcp/patterns';
import { handleToolCall, TOOL_DEFINITIONS, toMcpFinding } from '../../src/mcp/tools';
import { DEFAULT_CONFIG } from '../../src/config';
import type { ResolvedConfig, Constitution } from '../../src/types';

function freshDir(): string {
  return mkdtempSync(join(tmpdir(), 'slopbrick-patterns-'));
}

function writeFile(dir: string, rel: string, content: string): string {
  const full = join(dir, rel);
  mkdirSync(join(full, '..'), { recursive: true });
  writeFileSync(full, content, 'utf-8');
  return full;
}

const TEST_CONFIG: ResolvedConfig = {
  ...DEFAULT_CONFIG,
  include: ['src/**/*.{ts,tsx}'],
  exclude: [],
};

describe('extractImports', () => {
  it('extracts ESM imports', () => {
    const src = `import React from 'react';\nimport { foo } from 'zustand';\n`;
    expect(extractImports(src)).toEqual(['react', 'zustand']);
  });

  it('extracts type-only imports', () => {
    const src = `import type { Foo } from '@types/node';\nimport { Bar } from 'lodash';\n`;
    expect(extractImports(src)).toEqual(['@types/node', 'lodash']);
  });

  it('extracts side-effect imports', () => {
    const src = `import './styles.css';\nimport 'core-js/stable';\n`;
    expect(extractImports(src)).toEqual(['core-js/stable']);
  });

  it('extracts dynamic imports', () => {
    const src = `const m = await import('@tanstack/react-query');`;
    expect(extractImports(src)).toEqual(['@tanstack/react-query']);
  });

  it('extracts CommonJS requires', () => {
    const src = `const redux = require('redux');`;
    expect(extractImports(src)).toEqual(['redux']);
  });

  it('skips relative imports', () => {
    const src = `import x from '../foo';\nimport y from './bar';\nimport z from '/abs';\nimport a from 'zustand';\n`;
    expect(extractImports(src)).toEqual(['zustand']);
  });

  it('deduplicates while preserving first-seen order', () => {
    const src = `import 'react';\nimport 'zustand';\nimport 'react';\n`;
    expect(extractImports(src)).toEqual(['react', 'zustand']);
  });

  it('handles scoped packages with subpath correctly', () => {
    const src = `import { foo } from '@tanstack/react-query/devtools';`;
    expect(extractImports(src)).toEqual(['@tanstack/react-query/devtools']);
  });
});

describe('MCP evidence contract', () => {
  it('exposes per-finding calibration estimates while withholding unverified provenance', () => {
    const historical = toMcpFinding({
      ruleId: 'logic/heaps-deviation', category: 'logic', severity: 'medium', aiSpecific: false,
      message: 'Heaps deviation', line: 4, column: 2,
    });

    expect(historical).toMatchObject({
      aiSpecific: false,
      calibration: {
        status: 'historical-point-estimate-only',
        lastCalibratedAt: '2026-07-04T00:00:00Z',
        recall: expect.any(Number),
        falsePositiveRate: expect.any(Number),
        precision: expect.any(Number),
        lift: expect.any(Number),
        confidenceLimits: null,
        provenance: {
          status: 'historical-only',
          source: null,
          cohort: null,
        },
      },
    });
    expect(historical.calibration.provenance.reason).toMatch(/v10\.3 admission/i);

    const unavailable = toMcpFinding({
      ruleId: 'visual/unknown-rule', category: 'visual', severity: 'low', aiSpecific: true,
      message: 'Unknown rule', line: 1, column: 1,
    });
    expect(unavailable).toMatchObject({
      aiSpecific: true,
      calibration: {
        status: 'unavailable',
        confidenceLimits: null,
        provenance: {
          status: 'unavailable',
          source: null,
          cohort: null,
        },
      },
    });
    expect(unavailable.calibration.provenance.reason).toMatch(/no validated calibration entry/i);
  });

  it('returns a rule explanation with honest calibration and configuration policy state', async () => {
    const result = await handleToolCall(
      'slop_explain_rule',
      { ruleId: 'visual/test-rule' },
      {
        cwd: '/tmp',
        rules: [{
          id: 'visual/test-rule', category: 'visual', severity: 'medium', aiSpecific: true,
          create: () => ({}), analyze: () => [],
        }],
        config: { ...TEST_CONFIG, rules: { 'visual/test-rule': 'off' } },
      },
    );

    expect(result.isError).toBeFalsy();
    const payload = JSON.parse(result.content[0]!.text) as {
      evidence: { category: string; calibration: { confidenceLimits: unknown; confidenceLimitsReason: string } };
      configuration: { configuredSeverity: string; defaultOff: boolean; policyState: string };
      remediation: string;
      sourcePath: string;
      suppressionSnippet: string;
    };
    expect(payload.evidence.category).toBe('ai-signal');
    expect(payload.evidence.calibration.confidenceLimits).toBeNull();
    expect(payload.evidence.calibration.confidenceLimitsReason).toContain('No validated confidence interval');
    expect(payload.configuration).toMatchObject({
      configuredSeverity: 'off', defaultOff: false, policyState: 'configured-off',
    });
    expect(payload.configuration).not.toHaveProperty('effectiveActivation');
    expect(payload.remediation).toContain('src/rules');
    expect(payload.sourcePath).toContain('src/rules');
    expect(payload.suppressionSnippet).toContain('visual/test-rule');
  });

  it('projects issue extras into bounded safe why-it-fired facts', () => {
    const finding = toMcpFinding({
      ruleId: 'docs/broken-link', category: 'docs', severity: 'medium', aiSpecific: false,
      message: 'Broken link', line: 3, column: 4, extras: {
        link: './missing.md',
        absolutePath: '/tmp/mcp-evidence-secret.ts',
        nested: { file: '/tmp/mcp-evidence-nested.ts', count: 2 },
        externalPath: '/var/mcp-evidence-secret.ts',
      },
    }, '/tmp');

    expect(finding.whyItFired).toEqual({
      summary: 'Broken link',
      location: { line: 3, column: 4 },
      facts: {
        link: './missing.md',
        absolutePath: 'mcp-evidence-secret.ts',
        nested: { file: 'mcp-evidence-nested.ts', count: 2 },
        externalPath: '[redacted absolute path]',
      },
    });
    expect(JSON.stringify(finding)).not.toContain('/tmp/mcp-evidence');
    expect(finding).not.toHaveProperty('facts');
  });

  it('projects typed matched evidence under why-it-fired without leaking paths', () => {
    const finding = toMcpFinding({
      ruleId: 'typo/placeholder-text', category: 'typo', severity: 'low', aiSpecific: false,
      message: 'Placeholder text "TODO" is unfinished.', line: 1, column: 8,
      evidence: {
        kind: 'matched-source-span',
        status: 'exact',
        snippet: 'placeholder="TODO"',
        location: {
          start: { line: 1, column: 8 },
          end: { line: 1, column: 25 },
        },
        matched: { field: 'placeholder', key: 'placeholder', value: 'TODO' },
      },
    }, '/tmp/mcp-evidence-workspace');

    expect(finding.whyItFired.evidence).toEqual({
      kind: 'matched-source-span',
      status: 'exact',
      snippet: 'placeholder="TODO"',
      location: {
        start: { line: 1, column: 8 },
        end: { line: 1, column: 25 },
      },
      matched: { field: 'placeholder', key: 'placeholder', value: 'TODO' },
    });
    expect(JSON.stringify(finding)).not.toContain('/tmp/mcp-evidence-workspace');
  });

  it('redacts embedded POSIX/Windows paths and secret-like evidence text', () => {
    const finding = toMcpFinding({
      ruleId: 'typo/placeholder-text', category: 'typo', severity: 'low', aiSpecific: false,
      message: 'Placeholder text', line: 1, column: 1,
      evidence: {
        kind: 'matched-source-span',
        status: 'exact',
        snippet: 'placeholder="/Users/cheng/private.ts"; token="super-secret-value"; C:\\Users\\cheng\\private.ts',
        location: { start: { line: 1, column: 1 }, end: { line: 1, column: 90 } },
        matched: { field: 'apiKey', key: 'password', value: 'super-secret-value' },
      },
    });

    const serialized = JSON.stringify(finding);
    expect(serialized).not.toContain('/Users/cheng/private.ts');
    expect(serialized).not.toContain('C:\\Users\\cheng\\private.ts');
    expect(serialized).not.toContain('super-secret-value');
    expect(finding.whyItFired.evidence).toMatchObject({
      status: 'omitted',
      omission: { source: 'mcp-projection', reason: 'unsafe-path' },
      snippet: '[omitted unsafe evidence]',
      matched: {
        field: expect.stringContaining('[redacted'),
        key: expect.stringContaining('[redacted'),
        value: expect.stringContaining('[redacted'),
      },
    });
  });

  it.each([
    ['one-segment POSIX path', 'prefix /tmp', 'unsafe-path'],
    ['colon-embedded POSIX path', 'prefix:/tmp', 'unsafe-path'],
    ['drive path with spaces', String.raw`prefix C:\Program Files\private.ts`, 'unsafe-path'],
    ['UNC path', String.raw`prefix \\server\share\private.ts`, 'unsafe-path'],
  ] as const)('omits %s even when embedded in evidence', (_label, snippet, reason) => {
    const finding = toMcpFinding({
      ruleId: 'typo/placeholder-text', category: 'typo', severity: 'low', aiSpecific: false,
      message: 'Placeholder text', line: 1, column: 1,
      evidence: {
        kind: 'matched-source-span', status: 'exact', snippet,
        location: { start: { line: 1, column: 1 }, end: { line: 1, column: snippet.length } },
        matched: { field: 'placeholder', key: 'placeholder', value: 'TODO' },
      },
    });

    expect(finding.whyItFired.evidence).toMatchObject({
      status: 'omitted',
      snippet: '[omitted unsafe evidence]',
      omission: { source: 'mcp-projection', reason },
    });
    expect(JSON.stringify(finding)).not.toContain(snippet);
  });

  it('omits camelCase-sensitive key/value evidence and reports a typed reason', () => {
    const snippet = 'accessToken="super-secret"; refreshToken="refresh-secret"; databasePassword="db-secret"; secretKey="signing-secret"';
    const finding = toMcpFinding({
      ruleId: 'security/test', category: 'security', severity: 'high', aiSpecific: false,
      message: 'Sensitive finding', line: 1, column: 1,
      evidence: {
        kind: 'matched-source-span', status: 'exact', snippet,
        location: { start: { line: 1, column: 1 }, end: { line: 1, column: snippet.length } },
        matched: { field: 'accessToken', key: 'secretKey', value: 'super-secret' },
      },
    });

    expect(finding.whyItFired.evidence).toMatchObject({
      status: 'omitted',
      snippet: '[redacted sensitive text]',
      omission: { source: 'mcp-projection', reason: 'sensitive' },
      matched: {
        field: '[redacted sensitive text]',
        key: '[redacted sensitive text]',
        value: '[redacted sensitive text]',
      },
    });
    expect(JSON.stringify(finding)).not.toContain('super-secret');
    expect(JSON.stringify(finding)).not.toContain('secretKey');
  });

  it('sanitizes evidence details with the same path and camelCase policy', () => {
    const finding = toMcpFinding({
      ruleId: 'security/test', category: 'security', severity: 'high', aiSpecific: false,
      message: 'Sensitive finding', line: 1, column: 1,
      evidence: {
        kind: 'matched-source-span', status: 'exact', snippet: 'placeholder="TODO"',
        location: { start: { line: 1, column: 1 }, end: { line: 1, column: 18 } },
        matched: { field: 'placeholder', key: 'placeholder', value: 'TODO' },
        details: {
          accessToken: 'do-not-forward',
          nested: { path: 'prefix /tmp', databasePassword: 'db-secret' },
          safe: 'kept',
        },
      } as never,
    });

    const serialized = JSON.stringify(finding);
    expect(serialized).not.toContain('/tmp');
    expect(serialized).not.toContain('do-not-forward');
    expect(serialized).not.toContain('db-secret');
    expect(finding.whyItFired.evidence).toMatchObject({
      status: 'omitted',
      omission: { source: 'mcp-projection', reason: 'sensitive' },
      details: { nested: { path: '[omitted unsafe evidence]' }, safe: 'kept' },
    });
  });

  it('sanitizes issue messages and why-it-fired summaries at the MCP boundary', () => {
    const pathMessage = toMcpFinding({
      ruleId: 'typo/placeholder-text', category: 'typo', severity: 'low', aiSpecific: false,
      message: 'Placeholder text "prefix /tmp" is unsafe.', line: 1, column: 1,
    });
    expect(pathMessage.message).not.toContain('/tmp');
    expect(pathMessage.whyItFired.summary).toBe(pathMessage.message);

    const secretMessage = toMcpFinding({
      ruleId: 'security/test', category: 'security', severity: 'high', aiSpecific: false,
      message: 'Found accessToken="do-not-forward" in source.', line: 1, column: 1,
    });
    expect(secretMessage.message).not.toContain('accessToken');
    expect(secretMessage.message).not.toContain('do-not-forward');
    expect(secretMessage.whyItFired.summary).toBe(secretMessage.message);

    const mixedMessage = toMcpFinding({
      ruleId: 'security/test', category: 'security', severity: 'high', aiSpecific: false,
      message: 'Found accessToken="/tmp/private-token" in source.', line: 1, column: 1,
    });
    expect(mixedMessage.message).not.toContain('accessToken');
    expect(mixedMessage.message).not.toContain('/tmp/private-token');
  });

  it('bounds messages and advice after unsafe text redaction', () => {
    const hugeUnsafeText = `prefix /tmp/private.ts; ${'x'.repeat(3000)}`;
    const finding = toMcpFinding({
      ruleId: 'security/test', category: 'security', severity: 'high', aiSpecific: false,
      message: hugeUnsafeText, advice: hugeUnsafeText, line: 1, column: 1,
    });

    expect(finding.message).toBe('[omitted oversized message]');
    expect(finding.advice).toBe('[omitted oversized message]');
    expect(finding.whyItFired.summary).toBe('[omitted oversized message]');
    expect(finding.message.length).toBeLessThanOrEqual(64);
    expect(finding.advice?.length).toBeLessThanOrEqual(64);
    expect(JSON.stringify(finding)).not.toContain('/tmp/private.ts');
  });

  it.each([
    'token', 'super-secret-value', 'password-hunter', 'tokenValue',
    'accessTokenValue', 'refreshTokenValue', 'databasePassword',
    'passwordHash', 'secretValue', 'authorizationHeader', 'cookieValue',
  ])('omits sensitive bare, hyphenated, and suffix text: %s', (sensitiveText) => {
    const finding = toMcpFinding({
      ruleId: 'security/test', category: 'security', severity: 'high', aiSpecific: false,
      message: 'Sensitive finding', line: 1, column: 1,
      evidence: {
        kind: 'matched-source-span', status: 'exact', snippet: sensitiveText,
        location: { start: { line: 1, column: 1 }, end: { line: 1, column: sensitiveText.length } },
        matched: { field: 'placeholder', key: 'placeholder', value: sensitiveText },
      },
    });

    expect(finding.whyItFired.evidence).toMatchObject({
      status: 'omitted',
      snippet: '[redacted sensitive text]',
      omission: { source: 'mcp-projection', reason: 'sensitive' },
    });
    expect(JSON.stringify(finding)).not.toContain(sensitiveText);
  });

  it('keeps safe scalar evidence details exact', () => {
    const finding = toMcpFinding({
      ruleId: 'typo/placeholder-text', category: 'typo', severity: 'low', aiSpecific: false,
      message: 'Placeholder text', line: 1, column: 1,
      evidence: {
        kind: 'matched-source-span', status: 'exact', snippet: 'placeholder="TODO"',
        location: { start: { line: 1, column: 1 }, end: { line: 1, column: 18 } },
        matched: { field: 'placeholder', key: 'placeholder', value: 'TODO' },
        details: { field: 'placeholder', count: 1 },
      },
    });

    expect(finding.whyItFired.evidence).toMatchObject({
      status: 'exact',
      snippet: 'placeholder="TODO"',
      details: { field: 'placeholder', count: 1 },
    });
  });

  it('marks wide evidence details as omitted with deterministic metadata', () => {
    const details = Object.fromEntries(
      Array.from({ length: 40 }, (_, index) => [`field-${String(index).padStart(2, '0')}`, index]),
    );
    const issue = {
      ruleId: 'security/test', category: 'security' as const, severity: 'high' as const,
      aiSpecific: false, message: 'Details', line: 1, column: 1,
      evidence: {
        kind: 'matched-source-span' as const, status: 'exact' as const, snippet: 'placeholder="TODO"',
        location: { start: { line: 1, column: 1 }, end: { line: 1, column: 18 } },
        matched: { field: 'placeholder', key: 'placeholder', value: 'TODO' }, details,
      },
    } as never;

    const first = toMcpFinding(issue);
    const second = toMcpFinding(issue);
    expect(first.whyItFired.evidence).toMatchObject({
      status: 'omitted',
      snippet: '[omitted evidence details]',
      omission: {
        source: 'mcp-projection', reason: 'details-dropped', detailsDropped: true, detailReason: 'key-limit',
      },
    });
    expect((first.whyItFired.evidence as { details: Record<string, unknown> }).details).not.toHaveProperty('field-39');
    expect(second.whyItFired.evidence).toEqual(first.whyItFired.evidence);

    const combined = toMcpFinding({
      ...issue,
      evidence: { ...issue.evidence, snippet: 'prefix /tmp/private.ts' },
    });
    expect(combined.whyItFired.evidence).toMatchObject({
      status: 'omitted',
      omission: {
        source: 'mcp-projection', reason: 'unsafe-path', detailsDropped: true, detailReason: 'key-limit',
      },
    });
  });

  it('marks deep and budget-exhausted evidence details as omitted', () => {
    const deep = toMcpFinding({
      ruleId: 'security/test', category: 'security', severity: 'high', aiSpecific: false,
      message: 'Details', line: 1, column: 1,
      evidence: {
        kind: 'matched-source-span', status: 'exact', snippet: 'placeholder="TODO"',
        location: { start: { line: 1, column: 1 }, end: { line: 1, column: 18 } },
        matched: { field: 'placeholder', key: 'placeholder', value: 'TODO' },
        details: { a: { b: { c: { d: { value: 'hidden' } } } } },
      } as never,
    });
    expect(deep.whyItFired.evidence).toMatchObject({
      status: 'omitted',
      omission: { source: 'mcp-projection', reason: 'details-dropped', detailReason: 'depth' },
    });
    expect(JSON.stringify(deep)).not.toContain('hidden');

    const budgetDetails = Object.fromEntries(
      Array.from({ length: 32 }, (_, index) => [`field-${index}`, 'safe-value-'.repeat(20)]),
    );
    const budget = toMcpFinding({
      ruleId: 'security/test', category: 'security', severity: 'high', aiSpecific: false,
      message: 'Details', line: 1, column: 1,
      evidence: {
        kind: 'matched-source-span', status: 'exact', snippet: 'placeholder="TODO"',
        location: { start: { line: 1, column: 1 }, end: { line: 1, column: 18 } },
        matched: { field: 'placeholder', key: 'placeholder', value: 'TODO' }, details: budgetDetails,
      } as never,
    });
    expect(budget.whyItFired.evidence).toMatchObject({
      status: 'omitted',
      omission: { source: 'mcp-projection', reason: 'details-dropped', detailReason: 'budget' },
    });
  });

  it.each([
    ['nonfinite', { value: Number.NaN }, 'nonfinite'],
    ['nonplain', { value: new Date('2026-01-01T00:00:00.000Z') }, 'unsupported'],
  ] as const)('signals %s evidence detail drops', (_label, details, detailReason) => {
    const finding = toMcpFinding({
      ruleId: 'security/test', category: 'security', severity: 'high', aiSpecific: false,
      message: 'Details', line: 1, column: 1,
      evidence: {
        kind: 'matched-source-span', status: 'exact', snippet: 'placeholder="TODO"',
        location: { start: { line: 1, column: 1 }, end: { line: 1, column: 18 } },
        matched: { field: 'placeholder', key: 'placeholder', value: 'TODO' }, details,
      } as never,
    });
    expect(finding.whyItFired.evidence).toMatchObject({
      status: 'omitted',
      omission: { source: 'mcp-projection', reason: 'details-dropped', detailReason },
    });
  });

  it('signals an invalid scalar or array evidence-details root instead of claiming exact', () => {
    for (const details of ['scalar detail', ['array detail']] as const) {
      const finding = toMcpFinding({
        ruleId: 'security/test', category: 'security', severity: 'high', aiSpecific: false,
        message: 'Details', line: 1, column: 1,
        evidence: {
          kind: 'matched-source-span', status: 'exact', snippet: 'placeholder="TODO"',
          location: { start: { line: 1, column: 1 }, end: { line: 1, column: 18 } },
          matched: { field: 'placeholder', key: 'placeholder', value: 'TODO' }, details,
        } as never,
      });
      expect(finding.whyItFired.evidence).toMatchObject({
        status: 'omitted',
        omission: { source: 'mcp-projection', reason: 'details-dropped', detailReason: 'unsupported' },
      });
    }
  });

  it('signals symbol-keyed detail drops instead of silently claiming exact', () => {
    const symbol = Symbol('hidden-detail');
    const details = { safe: 'kept', [symbol]: 'must-drop' };
    const finding = toMcpFinding({
      ruleId: 'security/test', category: 'security', severity: 'high', aiSpecific: false,
      message: 'Details', line: 1, column: 1,
      evidence: {
        kind: 'matched-source-span', status: 'exact', snippet: 'placeholder="TODO"',
        location: { start: { line: 1, column: 1 }, end: { line: 1, column: 18 } },
        matched: { field: 'placeholder', key: 'placeholder', value: 'TODO' }, details,
      } as never,
    });

    expect(finding.whyItFired.evidence).toMatchObject({
      status: 'omitted',
      omission: { source: 'mcp-projection', reason: 'details-dropped', detailReason: 'property' },
      details: { safe: 'kept' },
    });
    expect(JSON.stringify(finding)).not.toContain('must-drop');
  });

  it('round-trips placeholder evidence through the slop_scan_file MCP boundary', async () => {
    const dir = freshDir();
    try {
      writeFile(dir, 'src/Input.tsx', '<input placeholder="TODO" />');
      const result = await handleToolCall(
        'slop_scan_file',
        { path: 'src/Input.tsx' },
        {
          cwd: dir,
          rules: [],
          config: { ...DEFAULT_CONFIG, include: ['src/**/*.tsx'], exclude: [], telemetry: false },
        },
      );

      expect(result.isError).toBeFalsy();
      const payload = JSON.parse(result.content[0]!.text) as {
        issues: Array<{ ruleId: string; whyItFired?: Record<string, unknown> }>;
      };
      const issue = payload.issues.find((candidate) => candidate.ruleId === 'typo/placeholder-text');
      expect(issue?.whyItFired).toMatchObject({
        evidence: {
          kind: 'matched-source-span',
          status: 'exact',
          snippet: 'placeholder="TODO"',
          matched: { field: 'placeholder', key: 'placeholder', value: 'TODO' },
        },
      });
      expect(JSON.stringify(issue)).not.toContain(dir);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('uses deterministic fallback snippets for oversized or source-like evidence', () => {
    const baseIssue = {
      ruleId: 'typo/placeholder-text', category: 'typo' as const, severity: 'low' as const,
      aiSpecific: false, message: 'Placeholder text', line: 1, column: 1,
    };
    const evidenceBase = {
      location: {
        start: { line: 1, column: 1 },
        end: { line: 1, column: 10 },
      },
      matched: { field: 'placeholder', key: 'placeholder', value: 'TODO' },
    };
    const oversized = toMcpFinding({
      ...baseIssue,
      evidence: { kind: 'matched-source-span', status: 'exact', snippet: 'x'.repeat(513), ...evidenceBase },
    });
    const sourceLike = toMcpFinding({
      ...baseIssue,
      evidence: {
        kind: 'matched-source-span',
        status: 'exact',
        snippet: 'const value = "secret";\nexport function leaked() {}',
        ...evidenceBase,
      },
    });

    expect(oversized.whyItFired.evidence).toMatchObject({
      snippet: '[omitted oversized snippet]',
    });
    expect(sourceLike.whyItFired.evidence).toMatchObject({
      status: 'omitted',
      snippet: '[omitted source-like snippet]',
      omission: { source: 'mcp-projection', reason: 'source-like' },
    });
    const producerOmitted = toMcpFinding({
      ...baseIssue,
      evidence: {
        kind: 'matched-source-span',
        status: 'omitted',
        ...evidenceBase,
        omission: {
          reason: 'oversized',
          snippetChars: 600,
          snippetBytes: 600,
          valueChars: 580,
          valueBytes: 580,
        },
      },
    });
    expect(producerOmitted.whyItFired.evidence).toMatchObject({
      status: 'omitted',
      snippet: '[omitted oversized snippet]',
      omission: { reason: 'oversized', snippetChars: 600, valueChars: 580 },
    });
    expect(oversized.whyItFired.evidence).toEqual(
      toMcpFinding({
        ...baseIssue,
        evidence: { kind: 'matched-source-span', status: 'exact', snippet: 'x'.repeat(513), ...evidenceBase },
      }).whyItFired.evidence,
    );
  });

  it.each([
    ['Python', 'def greet():\n    return "hello"'],
    ['Rust', 'fn main() { println!("hello"); }'],
    ['SQL', 'SELECT * FROM users;'],
    ['shell', 'echo "hello"'],
    ['C preprocessor', '#include <stdio.h>'],
  ])('omits source-like evidence from %s syntax', (_language, snippet) => {
    const finding = toMcpFinding({
      ruleId: 'security/test', category: 'security', severity: 'high', aiSpecific: false,
      message: 'Source-like evidence', line: 1, column: 1,
      evidence: {
        kind: 'matched-source-span', status: 'exact', snippet,
        location: { start: { line: 1, column: 1 }, end: { line: 1, column: snippet.length } },
        matched: { field: 'placeholder', key: 'placeholder', value: 'TODO' },
      },
    });

    expect(finding.whyItFired.evidence).toMatchObject({
      status: 'omitted',
      snippet: '[omitted source-like snippet]',
      omission: { source: 'mcp-projection', reason: 'source-like' },
    });
    expect(JSON.stringify(finding)).not.toContain(snippet);
  });

  it('keeps the existing why-it-fired shape when an issue has no evidence', () => {
    const finding = toMcpFinding({
      ruleId: 'docs/broken-link', category: 'docs', severity: 'medium', aiSpecific: false,
      message: 'Broken link', line: 3, column: 4,
    });

    expect(finding).toMatchObject({
      ruleId: 'docs/broken-link',
      category: 'docs',
      severity: 'medium',
      aiSpecific: false,
      line: 3,
      column: 4,
      message: 'Broken link',
      advice: undefined,
    });
    expect(finding.whyItFired).toEqual({
      summary: 'Broken link',
      location: { line: 3, column: 4 },
      facts: null,
    });
  });

  it('drops source-like, deeply nested, and oversized extras from MCP findings', () => {
    const finding = toMcpFinding({
      ruleId: 'docs/broken-link', category: 'docs', severity: 'medium', aiSpecific: false,
      message: 'Broken link', line: 3, column: 4, extras: {
        source: 'const credential = "do-not-forward";\n'.repeat(300),
        token: 'do-not-forward-token',
        tooMany: Array.from({ length: 80 }, (_, index) => index),
        deep: { a: { b: { c: { d: { e: 'hidden' } } } } },
        fn: () => 'not-json',
      },
    });

    expect(finding.whyItFired.facts).toEqual({
      tooMany: '[omitted oversized array]',
      deep: { a: { b: '[omitted nested value]' } },
    });
    expect(JSON.stringify(finding)).not.toContain('credential');
    expect(JSON.stringify(finding)).not.toContain('do-not-forward-token');
    expect(JSON.stringify(finding)).not.toContain('hidden');
  });

  it('enforces one deterministic global evidence budget across wide nested extras', () => {
    const hugeKey = 'x'.repeat(200);
    const extras = {
      stable: { clonePath: '/tmp/components/Button.tsx', count: 2 },
      zWide: Object.fromEntries(
        Array.from({ length: 40 }, (_, index) => [
          `field-${String(index).padStart(2, '0')}`,
          { ordinal: index, sample: 'x'.repeat(400) },
        ]),
      ),
      [hugeKey]: 'must not be forwarded',
    };

    const first = toMcpFinding({
      ruleId: 'docs/broken-link', category: 'docs', severity: 'medium', aiSpecific: false,
      message: 'Broken link', line: 3, column: 4, extras,
    }, '/tmp');
    const second = toMcpFinding({
      ruleId: 'docs/broken-link', category: 'docs', severity: 'medium', aiSpecific: false,
      message: 'Broken link', line: 3, column: 4, extras,
    }, '/tmp');

    const facts = first.whyItFired.facts as Record<string, unknown>;
    expect(Buffer.byteLength(JSON.stringify(facts), 'utf8')).toBeLessThanOrEqual(2048);
    expect(facts).toMatchObject({
      stable: { clonePath: 'components/Button.tsx', count: 2 },
      zWide: { 'field-00': { ordinal: 0, sample: 'x'.repeat(400) } },
    });
    expect(facts).not.toHaveProperty(hugeKey);
    expect((facts.zWide as Record<string, unknown>)).not.toHaveProperty('field-39');
    expect(second.whyItFired.facts).toEqual(first.whyItFired.facts);
  });
});

describe('categorizeImport', () => {
  it('matches bare zustand to stateManagement', () => {
    expect(categorizeImport('zustand')).toEqual({
      field: 'stateManagement',
      signal: 'zustand',
      matchedPackage: 'zustand',
    });
  });

  it('matches @reduxjs/toolkit to redux signal', () => {
    const hit = categorizeImport('@reduxjs/toolkit');
    expect(hit?.signal).toBe('redux');
    expect(hit?.field).toBe('stateManagement');
  });

  it('strips subpath when looking up a scoped package', () => {
    expect(categorizeImport('@tanstack/react-query/devtools')?.signal).toBe('react-query');
  });

  it('returns null for unknown imports', () => {
    expect(categorizeImport('some-random-package')).toBeNull();
  });
});

describe('checkFileConstitution', () => {
  const constitution: Constitution = {
    stateManagement: ['zustand'],
    dataFetching: ['react-query'],
    uiLibrary: ['shadcn'],
  };

  it('returns empty violations when file imports conformant packages', () => {
    const src = `import { create } from 'zustand';\nimport { useQuery } from '@tanstack/react-query';\n`;
    const result = checkFileConstitution(src, constitution);
    expect(result.violations).toHaveLength(0);
    expect(result.imports).toEqual(['zustand', '@tanstack/react-query']);
  });

  it('flags a state-management violation', () => {
    const src = `import { createStore } from 'redux';\n`;
    const result = checkFileConstitution(src, constitution);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].category).toBe('stateManagement');
    expect(result.violations[0].declared).toEqual(['zustand']);
    expect(result.violations[0].message).toContain("'zustand'");
    expect(result.violations[0].message).toContain("'redux'");
  });

  it('flags a data-fetching violation via scoped subpath', () => {
    const src = `import { useSWRConfig } from 'swr';\n`;
    const result = checkFileConstitution(src, constitution);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].category).toBe('dataFetching');
  });

  it('reports no violations when constitution is undefined', () => {
    const src = `import x from 'redux';\n`;
    const result = checkFileConstitution(src, undefined);
    expect(result.violations).toHaveLength(0);
    expect(result.imports).toEqual(['redux']);
  });

  it('skips categories not declared in constitution', () => {
    const src = `import { css } from '@emotion/react';\n`;
    const result = checkFileConstitution(src, { stateManagement: ['zustand'] });
    // styling is not declared, so no violation even though emotion is imported
    expect(result.violations).toHaveLength(0);
  });

  it('explicit empty array declaration means "no constraint"', () => {
    const src = `import { create } from 'zustand';\n`;
    const result = checkFileConstitution(src, { stateManagement: [] });
    expect(result.violations).toHaveLength(0);
  });

  it('flags an import on the forbidden deny-list', () => {
    const src = `import moment from 'moment';\n`;
    const result = checkFileConstitution(src, { stateManagement: ['zustand'], forbidden: ['moment'] });
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].category).toBe('forbidden');
    expect(result.violations[0].import).toBe('moment');
    expect(result.violations[0].declared).toEqual(['moment']);
    expect(result.violations[0].message).toContain('deny-list');
  });

  it('reports both forbidden and canonical violations when an import hits the deny-list AND a category mismatch', () => {
    // `moment` is not on the canonical stateManagement signal table at
    // all (it's a date library), but importing it should still produce
    // a forbidden violation. The state-management violation is also
    // raised because the import's canonical category (none → no
    // mismatch) does NOT add a violation. Use a different example:
    // `redux` IS a canonical stateManagement import; declaring it as
    // forbidden yields BOTH violations.
    const src = `import { createStore } from 'redux';\n`;
    const result = checkFileConstitution(src, {
      stateManagement: ['zustand'],
      forbidden: ['redux'],
    });
    expect(result.violations).toHaveLength(2);
    const categories = result.violations.map((v) => v.category);
    expect(categories).toContain('forbidden');
    expect(categories).toContain('stateManagement');
  });

  it('empty forbidden list produces no forbidden violations', () => {
    const src = `import moment from 'moment';\nimport { create } from 'zustand';\n`;
    const result = checkFileConstitution(src, { stateManagement: ['zustand'], forbidden: [] });
    expect(result.violations.some((v) => v.category === 'forbidden')).toBe(false);
  });
});

describe('buildPatternInventory', () => {
  it('finds modal/dialog files by basename', async () => {
    const dir = freshDir();
    try {
      writeFile(dir, 'src/components/Dialog.tsx', 'export const Dialog = () => null;');
      writeFile(dir, 'src/components/Modal.tsx', 'export const Modal = () => null;');
      const inv = await buildPatternInventory(dir, TEST_CONFIG);
      const names = inv.patterns.modal.map((p) => p.name);
      expect(names).toContain('Dialog');
      expect(names).toContain('Modal');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('finds button variants by basename', async () => {
    const dir = freshDir();
    try {
      writeFile(dir, 'src/components/Button.tsx', '');
      writeFile(dir, 'src/components/IconButton.tsx', '');
      const inv = await buildPatternInventory(dir, TEST_CONFIG);
      const names = inv.patterns.button.map((p) => p.name);
      expect(names).toContain('Button');
      expect(names).toContain('IconButton');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('does not false-positive on rule files whose name contains component words', async () => {
    const dir = freshDir();
    try {
      // Rule-file basenames that happen to contain "button" or "modal"
      // should NOT be classified as components.
      writeFile(dir, 'src/rules/visual/math-button-label-uniformity.ts', '');
      writeFile(dir, 'src/rules/visual/dialog-spacing.ts', '');
      const inv = await buildPatternInventory(dir, TEST_CONFIG);
      expect(inv.patterns.button).toHaveLength(0);
      expect(inv.patterns.modal).toHaveLength(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('finds api-client files by directory pattern', async () => {
    const dir = freshDir();
    try {
      writeFile(dir, 'src/lib/api/users.ts', '');
      writeFile(dir, 'src/services/orders.ts', '');
      const inv = await buildPatternInventory(dir, TEST_CONFIG);
      expect(inv.patterns.api.length).toBeGreaterThan(0);
      const apiFiles = inv.patterns.api.flatMap((p) => p.files);
      expect(apiFiles.some((f) => f.endsWith('users.ts'))).toBe(true);
      expect(apiFiles.some((f) => f.endsWith('orders.ts'))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('detects state-management library from imports', async () => {
    const dir = freshDir();
    try {
      writeFile(
        dir,
        'src/store/userStore.ts',
        `import { create } from 'zustand';\nexport const useUser = create(() => ({}));`,
      );
      const inv = await buildPatternInventory(dir, TEST_CONFIG);
      const stateNames = inv.patterns.state.map((p) => p.name);
      expect(stateNames).toContain('zustand');
      expect(inv.patterns.state[0].imports).toContain('zustand');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('detects data-fetching library from imports', async () => {
    const dir = freshDir();
    try {
      writeFile(
        dir,
        'src/api/users.ts',
        `import { useQuery } from '@tanstack/react-query';\nexport const useUsers = () => useQuery({});`,
      );
      const inv = await buildPatternInventory(dir, TEST_CONFIG);
      const fetchNames = inv.patterns.dataFetching.map((p) => p.name);
      expect(fetchNames).toContain('react-query');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('respects maxFiles cap', async () => {
    const dir = freshDir();
    try {
      for (let i = 0; i < 5; i++) {
        writeFile(dir, `src/components/Button${i}.tsx`, '');
      }
      const inv = await buildPatternInventory(dir, TEST_CONFIG, 2);
      expect(inv.scannedFiles).toBe(2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('uses an exact deterministic candidate list without rediscovering excluded files', async () => {
    const dir = freshDir();
    try {
      const selected = writeFile(dir, 'src/components/Button.tsx', '');
      const laterSelected = writeFile(dir, 'src/components/ZDialog.tsx', '');
      writeFile(dir, 'src/excluded/Dialog.tsx', '');

      const inv = await buildPatternInventory(
        dir,
        TEST_CONFIG,
        1,
        [laterSelected, selected, selected],
      );

      expect(inv.scannedFiles).toBe(1);
      expect(inv.patterns.button.map((pattern) => pattern.name)).toEqual(['Button']);
      expect(inv.patterns.modal).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('MCP file tools workspace boundary', () => {
  it('scans a workspace-relative file and rejects traversal outside the workspace', async () => {
    const dir = freshDir();
    const outside = freshDir();
    try {
      writeFile(dir, 'src/example.ts', 'export const value = 1;');
      writeFile(outside, 'secret.ts', 'export const secret = true;');
      const ctx = { cwd: dir, rules: [], config: TEST_CONFIG };

      const inside = await handleToolCall('slop_scan_file', { path: 'src/example.ts' }, ctx);
      expect(inside.isError).toBeFalsy();
      const payload = JSON.parse(inside.content[0]!.text);
      expect(payload.filePath).toBe(realpathSync(join(dir, 'src/example.ts')));
      // The tool definition promises the per-file Bayesian score. Keep the
      // probability and confidence tier on the wire so MCP clients can use
      // the advertised AI-likelihood signal instead of inferring it from
      // issue counts.
      expect(payload.compositeScore).toMatchObject({
        probability: expect.any(Number),
        confidenceTier: expect.any(String),
      });

      const traversal = await handleToolCall('slop_scan_file', { path: '../' + outside.split('/').pop() + '/secret.ts' }, ctx);
      expect(traversal.isError).toBe(true);
      expect(traversal.content[0]!.text).toContain('inside the MCP workspace');
    } finally {
      rmSync(dir, { recursive: true, force: true });
      rmSync(outside, { recursive: true, force: true });
    }
  });

  it('rejects symlinks that resolve outside the workspace for constitution checks', async () => {
    const dir = freshDir();
    const outside = freshDir();
    try {
      const secret = writeFile(outside, 'secret.ts', `import 'moment';`);
      symlinkSync(secret, join(dir, 'linked.ts'));
      const ctx = { cwd: dir, rules: [], config: TEST_CONFIG };
      const result = await handleToolCall('slop_check_constitution', { path: 'linked.ts' }, ctx);
      expect(result.isError).toBe(true);
      expect(result.content[0]!.text).toContain('inside the MCP workspace');
    } finally {
      rmSync(dir, { recursive: true, force: true });
      rmSync(outside, { recursive: true, force: true });
    }
  });
});

describe('MCP tool handlers', () => {
  it('exposes the new tools in TOOL_DEFINITIONS', () => {
    const names = TOOL_DEFINITIONS.map((t) => t.name);
    expect(names).toContain('slop_suggest');
    expect(names).toContain('slop_check_constitution');
  });

  it('routes slop_suggest through handleToolCall', async () => {
    const dir = freshDir();
    try {
      // A real React component declaration so the modal regex fires.
      writeFile(
        dir,
        'src/components/Dialog.tsx',
        `import React from 'react';\nexport function Dialog({ open, onClose, children }) {\n  return open ? <div role="dialog">{children}</div> : null;\n}\n`,
      );
      const result = await handleToolCall(
        'slop_suggest',
        {},
        { cwd: dir, rules: [], config: TEST_CONFIG },
      );
      expect(result.isError).toBeFalsy();
      const text = result.content[0].text;
      const parsed = JSON.parse(text) as {
        hint: string;
        doNotCreate: string[];
        declaredStack: string[];
        existingPatterns: {
          scannedFiles: number;
          patterns: { modal: { name: string }[] };
        };
      };
      expect(parsed.hint).toContain('instead of creating new ones');
      expect(parsed.doNotCreate).toBeDefined();
      expect(parsed.declaredStack).toBeDefined();
      expect(parsed.existingPatterns.patterns.modal.map((p) => p.name)).toContain('Dialog');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('routes slop_check_constitution and reports violations', async () => {
    const dir = freshDir();
    try {
      const file = writeFile(dir, 'src/store.ts', `import { createStore } from 'redux';\n`);
      const config: ResolvedConfig = {
        ...TEST_CONFIG,
        constitution: { stateManagement: ['zustand'] },
      };
      const result = await handleToolCall(
        'slop_check_constitution',
        { path: file },
        { cwd: dir, rules: [], config },
      );
      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(result.content[0].text) as {
        violationCount: number;
        violations: { category: string; import: string }[];
      };
      expect(parsed.violationCount).toBe(1);
      expect(parsed.violations[0].category).toBe('stateManagement');
      expect(parsed.violations[0].import).toBe('redux');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('returns toolError when slop_check_constitution path is missing', async () => {
    const result = await handleToolCall(
      'slop_check_constitution',
      {},
      { cwd: '/tmp', rules: [], config: TEST_CONFIG },
    );
    expect(result.isError).toBe(true);
  });

  it('returns toolError when slop_check_constitution path is unreadable', async () => {
    const dir = freshDir();
    try {
      const result = await handleToolCall(
        'slop_check_constitution',
        { path: join(dir, 'does-not-exist.ts') },
        { cwd: dir, rules: [], config: TEST_CONFIG },
      );
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Cannot read file');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('returns toolError for unknown tool', async () => {
    const result = await handleToolCall(
      'slop_nonexistent',
      {},
      { cwd: '/tmp', rules: [], config: TEST_CONFIG },
    );
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Unknown tool');
  });

  // v0.41.0 (Sprint 2, task 2b.0): the previously-split
  // runSuggest / runSuggestWithStructure pair is now a single
  // handler behind `runSuggest(args, ctx, { includeStructure })`.
  // The dispatch contract is:
  //
  //   - `slop_suggest` → runSuggest(args, ctx) — slow path,
  //     always JSON.
  //   - `slop_suggest_with_structure` → runSuggest(args, ctx,
  //     { includeStructure: true }) — fast path when
  //     `.slopbrick/structure.md` exists, slow-path-with-hint
  //     otherwise.

  it('routes slop_suggest_with_structure through the consolidated runSuggest (slow path → annotated)', async () => {
    // No .slopbrick/structure.md on disk: the fast path is
    // unreachable, so the handler falls back to the slow path
    // and attaches a `structureHint` so the agent learns to
    // run `slopbrick scan` next time.
    const dir = freshDir();
    try {
      writeFile(
        dir,
        'src/components/Dialog.tsx',
        `import React from 'react'; export function Dialog() { return <div role="dialog" />; }`,
      );
      const result = await handleToolCall(
        'slop_suggest_with_structure',
        {},
        { cwd: dir, rules: [], config: TEST_CONFIG },
      );
      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(result.content[0].text) as Record<string, unknown>;
      // Slow-path shape preserved: hint, doNotCreate, declaredStack,
      // existingPatterns all present.
      expect(parsed.hint).toContain('instead of creating new ones');
      expect(parsed.doNotCreate).toBeDefined();
      expect(parsed.declaredStack).toBeDefined();
      expect(parsed.existingPatterns).toBeDefined();
      // Plus the upgrade hint.
      expect(parsed.structureHint).toContain('structure.md');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('routes slop_suggest_with_structure through the fast path when structure.md exists', async () => {
    // Seed `.slopbrick/structure.md` so the fast path wins. The
    // handler should return the markdown verbatim (single text
    // block, no JSON parsing).
    const dir = freshDir();
    try {
      const memoryDir = join(dir, '.slopbrick');
      mkdirSync(memoryDir, { recursive: true });
      // Write a sentinel string the handler will return verbatim.
      // The fast-path code reads `readStructureMarkdown(ctx.cwd)`
      // and passes the result through unchanged, so any non-empty
      // markdown trips the fast-path branch.
      const marker = '# Fast-path marker\n\n(ignore the contents — the handler returns this verbatim)\n';
      writeFileSync(join(memoryDir, 'structure.md'), marker, 'utf-8');
      const result = await handleToolCall(
        'slop_suggest_with_structure',
        {},
        { cwd: dir, rules: [], config: TEST_CONFIG },
      );
      expect(result.isError).toBeFalsy();
      // The marker round-trips intact — that's the contract.
      expect(result.content[0].text).toContain('Fast-path marker');
      // The fast-path response is raw markdown, NOT a JSON object
      // with `hint` / `doNotCreate` / `existingPatterns`. Trying to
      // JSON.parse it must throw — that proves we didn't accidentally
      // take the slow path.
      expect(() => JSON.parse(result.content[0].text)).toThrow();
      // Also: the response must NOT contain any of the slow-path
      // keys (defensive — guards against a future refactor that
      // accidentally wraps the markdown in an envelope).
      expect(result.content[0].text).not.toContain('"hint"');
      expect(result.content[0].text).not.toContain('"doNotCreate"');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('routes slop_suggest through the consolidated runSuggest (slow path, no hint)', async () => {
    // The slow-path variant (`slop_suggest`) must NOT attach the
    // structureHint — that's a contract preservation: agents that
    // explicitly asked for the JSON form don't want the upgrade
    // hint polluting the response.
    const dir = freshDir();
    try {
      writeFile(
        dir,
        'src/components/Card.tsx',
        `export function Card() { return <div />; }`,
      );
      const result = await handleToolCall(
        'slop_suggest',
        {},
        { cwd: dir, rules: [], config: TEST_CONFIG },
      );
      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(result.content[0].text) as Record<string, unknown>;
      expect(parsed.hint).toContain('instead of creating new ones');
      expect(parsed.structureHint).toBeUndefined();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
