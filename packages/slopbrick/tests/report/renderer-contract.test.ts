import { describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { STRUCTURE_SCHEMA_VERSION } from '@usebrick/core';
import { DEFAULT_CONFIG } from '../../src/config';
import { runSuggest, type ToolContext } from '../../src/mcp/tools';
import { formatHtml } from '../../src/report/html.js';
import { projectFirstScan } from '../../src/report/first-scan.js';
import { formatJson } from '../../src/report/json.js';
import { formatMarkdown } from '../../src/report/markdown.js';
import { formatPretty, formatBriefReport, formatWhyFailingReport } from '../../src/report/pretty.js';
import { formatSarif } from '../../src/report/sarif.js';
import { SCORE_BRIEFS } from '../../src/report/score-contract.js';
import { outputScanResults } from '../../src/cli/report/renderOutput.js';
import type { Issue, ProjectReport, ResolvedConfig } from '../../src/types.js';
import { approvedCurrentPolicyFixture } from '../helpers/current-evidence-policy-v2.js';

const scoreBasis = {
  denominator: 7,
  analyzedFiles: 7,
  issueSet: 'effective' as const,
  suppressedIssueCount: 2,
  parseErrorCount: 1,
};

const offIssue: Issue = {
  ruleId: 'test/off-rule',
  category: 'test',
  severity: 'off' as never,
  aiSpecific: false,
  filePath: 'src/off.ts',
  message: 'Disabled finding must remain machine-auditable only',
  line: 1,
  column: 1,
};

const activeIssue: Issue = {
  ...offIssue,
  ruleId: 'test/active-rule',
  severity: 'medium',
  filePath: 'src/active.ts',
  message: 'Active finding',
};

function report(): ProjectReport {
  return {
    version: '0.44.0',
    generatedAt: '2026-07-10T00:00:00.000Z',
    aiSlopScore: 12.3,
    engineeringHygiene: 45.6,
    security: 78.9,
    repositoryHealth: 63.4,
    testQuality: 91.2,
    assemblyHealth: 87.7,
    totalScore: 12.3,
    categoryScores: { visual: 0, typo: 0, wcag: 0, layout: 0, component: 0, logic: 0, arch: 0, perf: 0, security: 0, test: 0, docs: 0, db: 0, ai: 0, context: 0, product: 0, i18n: 0 },
    boundaryScore: 0,
    contextScore: 0,
    visualScore: 0,
    p90Score: 0,
    peakScore: 0,
    componentCount: 0,
    fileCount: 7,
    thresholds: { meanSlop: 30, p90Slop: 30, individualSlopThreshold: 60 },
    components: [],
    issues: [activeIssue, offIssue],
    scoreBasis,
  };
}

describe('headline score renderer contract', () => {
  it('dispatches projected reports to the bounded first screen and complete five-area full feed', () => {
    const secondIssue: Issue = {
      ...activeIssue,
      ruleId: 'security/second-active-rule',
      category: 'security',
      severity: 'high',
      filePath: 'src/security.ts',
      message: 'Review the security boundary.',
      advice: 'Inspect the boundary manually.',
    };
    const input = Object.assign(report(), {
      completionStatus: 'complete' as const,
      scoreValidity: 'valid' as const,
      issues: [activeIssue, secondIssue, offIssue],
    }) as ProjectReport;
    input.firstScan = projectFirstScan(input, {
      cwd: '/workspace',
      configHash: 'config-a',
    });

    const compact = formatPretty(input, { full: false });
    const full = formatPretty(input, { full: true });
    const legacy = formatPretty(report(), { full: false });
    const fullDetail = full.split('\n\nFull report\n\n')[1] ?? '';

    expect(compact).toContain('Repository Health');
    expect(compact).toContain('Recommended actions');
    expect(compact).toContain('Use --full for every score and finding.');
    expect(compact).not.toContain('Full report');
    expect(compact).not.toContain('Category breakdown');
    expect(compact).not.toContain('AI-specific signals');
    expect(full).toContain('\n\nFull report\n\n');
    expect(fullDetail).toContain('Category breakdown');
    expect(fullDetail).toContain('test/active-rule');
    expect(fullDetail).toContain('security/second-active-rule');
    expect(fullDetail).toContain('Evidence tier: advisory');
    expect(fullDetail).toContain('Location/context:');
    expect(fullDetail).toContain('Why:');
    expect(fullDetail).toContain('Change: current');
    expect(fullDetail).toContain('Action: manual review');
    expect(fullDetail).not.toContain('AI-specific signals');
    expect(fullDetail).not.toContain('Engineering findings');
    const areaOffsets = [
      'Visual Slop (0)',
      'Frontend Implementation (0)',
      'Code and Logic (1)',
      'Repository Coherence (0)',
      'Accessibility and Resilience (1)',
    ].map((heading) => fullDetail.indexOf(heading));
    expect(areaOffsets.every((offset) => offset >= 0)).toBe(true);
    expect(areaOffsets).toEqual([...areaOffsets].sort((left, right) => left - right));
    expect(legacy).toContain('AI-specific signals (0)');
    expect(legacy).toContain('Engineering findings (1)');
  });

  it('renders the complete historical-evidence boundary in compact recommendations and full rows', () => {
    const calibratedIssue: Issue = {
      ...activeIssue,
      ruleId: 'logic/zipf-slope-anomaly',
      category: 'logic',
      filePath: '/workspace/src/domain.ts',
      message: 'Identifier frequency differs from the measured baseline.',
      signalStrength: {
        recall: 0.0168,
        fpRate: 0.0111,
        ratio: 57.13,
        precision: 0.6369,
        lastCalibratedAt: '2026-07-04T00:00:00Z',
        verdict: 'USEFUL',
      },
    };
    const input = Object.assign(report(), {
      completionStatus: 'complete' as const,
      scoreValidity: 'valid' as const,
      issues: [calibratedIssue],
    }) as ProjectReport;
    input.firstScan = projectFirstScan(input, {
      cwd: '/workspace',
      configHash: 'config-a',
    });

    const compact = formatPretty(input, { full: false, cwd: '/workspace' });
    const full = formatPretty(input, { full: true, cwd: '/workspace' });
    const fullDetail = full.split('\n\nFull report\n\n')[1] ?? '';
    for (const output of [compact, fullDetail]) {
      expect(output).toContain('historical verdict USEFUL');
      expect(output).toContain('historical precision 63.69%');
      expect(output).toContain('last calibrated 2026-07-04');
      expect(output).toContain(
        'Historical rule metrics only; not current policy evidence and not proof of who wrote the code.',
      );
    }
    expect(input.firstScan.findings[0]?.evidence.claim).toBe(
      'Historical rule metrics only; not current policy evidence and not proof of who wrote the code.',
    );
  });

  it('renders one current-policy evidence object and copy across terminal, JSON, Markdown, HTML, and SARIF', () => {
    const policyIssue: Issue = {
      ...activeIssue,
      ruleId: 'ai/any-density',
      category: 'ai',
      aiSpecific: true,
      filePath: '/workspace/src/unsafe.ts',
      message: 'Type assertions weaken static checking.',
      evidence: {
        kind: 'matched-source-span',
        status: 'exact',
        snippet: 'value as any',
        location: { start: { line: 3, column: 2 }, end: { line: 3, column: 14 } },
      },
      signalStrength: {
        recall: 0.8,
        fpRate: 0.01,
        ratio: 80,
        precision: 0.99,
        lastCalibratedAt: '2026-07-04T00:00:00Z',
        verdict: 'USEFUL',
      },
    };
    const input = Object.assign(report(), {
      completionStatus: 'complete' as const,
      scoreValidity: 'valid' as const,
      issues: [policyIssue],
    }) as ProjectReport;
    input.firstScan = projectFirstScan(input, {
      cwd: '/workspace',
      configHash: 'config-a',
      currentPolicy: approvedCurrentPolicyFixture(),
    });

    const json = JSON.parse(formatJson(input)) as {
      firstScan: { findings: Array<{ evidence: Record<string, unknown> }> };
    };
    const sarif = JSON.parse(formatSarif(input, { cwd: '/workspace' })) as {
      runs: Array<{ results: Array<{ properties: { slopbrickEvidence?: Record<string, unknown> } }> }>;
    };
    const expected = json.firstScan.findings[0]!.evidence;

    expect(expected).toMatchObject({
      tier: 'quality-candidate-unmeasured',
      claim: 'Accepted quality concern; owner measurement was not requested.',
      sourceSpan: 'exact',
      policyVersion: 'slopbrick-rule-evidence-policy-v2',
      qualityDomain: 'type-safety',
      claimClass: 'contextual-heuristic',
      readiness: 'evidence-ready',
      scoreEligible: false,
      admitted: false,
      legacyMetrics: {
        verdict: 'USEFUL',
        precision: 0.99,
        lastCalibratedAt: '2026-07-04T00:00:00Z',
      },
    });
    expect(sarif.runs[0]!.results[0]!.properties.slopbrickEvidence).toEqual(expected);

    for (const output of [
      formatPretty(input, { full: false, cwd: '/workspace' }),
      formatPretty(input, { full: true, cwd: '/workspace' }),
      formatMarkdown(input),
      formatHtml(input),
    ]) {
      expect(output).toContain('quality-candidate-unmeasured');
      expect(output).toContain('Accepted quality concern; owner measurement was not requested.');
    }
  });

  it('matches exact evidence by stable finding identity through the CLI render path', async () => {
    const firstIssue: Issue = {
      ...activeIssue,
      ruleId: 'logic/first-evidence',
      category: 'logic',
      filePath: '/workspace/src/first.ts',
      evidence: {
        kind: 'matched-source-span',
        status: 'exact',
        snippet: 'FIRST_EXACT_SNIPPET',
        location: { start: { line: 2, column: 1 }, end: { line: 2, column: 20 } },
        matched: { field: 'fixture', key: 'first', value: 'FIRST_EXACT_SNIPPET' },
      },
    };
    const secondIssue: Issue = {
      ...activeIssue,
      ruleId: 'logic/second-evidence',
      category: 'logic',
      filePath: '/workspace/src/second.ts',
      evidence: {
        kind: 'matched-source-span',
        status: 'exact',
        snippet: 'SECOND_EXACT_SNIPPET',
        location: { start: { line: 3, column: 1 }, end: { line: 3, column: 21 } },
        matched: { field: 'fixture', key: 'second', value: 'SECOND_EXACT_SNIPPET' },
      },
    };
    const input = Object.assign(report(), {
      completionStatus: 'complete' as const,
      scoreValidity: 'valid' as const,
      issues: [firstIssue, secondIssue],
    }) as ProjectReport;
    input.firstScan = projectFirstScan(input, {
      cwd: '/workspace',
      configHash: 'config-a',
    });
    input.issues = [secondIssue, firstIssue];
    const logged: string[] = [];
    const spy = vi.spyOn(console, 'log').mockImplementation((value) => {
      logged.push(String(value));
    });
    try {
      await outputScanResults(input, { format: 'pretty', full: true }, '/workspace');
    } finally {
      spy.mockRestore();
    }
    const output = logged.join('\n').split('\n\nFull report\n\n')[1] ?? '';
    const firstRow = output.slice(
      output.indexOf('[MEDIUM  ] logic/first-evidence'),
      output.indexOf('[MEDIUM  ] logic/second-evidence'),
    );
    const secondRow = output.slice(output.indexOf('[MEDIUM  ] logic/second-evidence'));

    expect(firstRow).toContain('FIRST_EXACT_SNIPPET');
    expect(firstRow).not.toContain('SECOND_EXACT_SNIPPET');
    expect(secondRow).toContain('SECOND_EXACT_SNIPPET');
    expect(secondRow).not.toContain('FIRST_EXACT_SNIPPET');
  });

  it('uses only unique exact relative locations without cwd and omits ambiguous evidence', () => {
    const relativeIssue = (ruleId: string, filePath: string, snippet: string): Issue => ({
      ...activeIssue,
      ruleId,
      category: 'logic',
      filePath,
      evidence: {
        kind: 'matched-source-span',
        status: 'exact',
        snippet,
        location: { start: { line: 1, column: 1 }, end: { line: 1, column: 8 } },
        matched: { field: 'fixture', key: ruleId, value: snippet },
      },
    });
    const firstIssue = relativeIssue('logic/relative-first', 'src/first.ts', 'RELATIVE_FIRST');
    const secondIssue = relativeIssue('logic/relative-second', 'src/second.ts', 'RELATIVE_SECOND');
    const input = Object.assign(report(), {
      completionStatus: 'complete' as const,
      scoreValidity: 'valid' as const,
      issues: [firstIssue, secondIssue],
    }) as ProjectReport;
    input.firstScan = projectFirstScan(input, {
      cwd: '/workspace',
      configHash: 'config-a',
    });
    input.issues = [secondIssue, firstIssue];
    const reordered = formatPretty(input, { full: true }).split('\n\nFull report\n\n')[1] ?? '';
    const firstRow = reordered.slice(
      reordered.indexOf('[MEDIUM  ] logic/relative-first'),
      reordered.indexOf('[MEDIUM  ] logic/relative-second'),
    );
    expect(firstRow).toContain('RELATIVE_FIRST');
    expect(firstRow).not.toContain('RELATIVE_SECOND');

    const ambiguousA = relativeIssue('logic/ambiguous', 'src/same.ts', 'AMBIGUOUS_A');
    const ambiguousB = {
      ...relativeIssue('logic/ambiguous', 'src/same.ts', 'AMBIGUOUS_B'),
      message: 'A second finding at the same exact location.',
    };
    const ambiguous = Object.assign(report(), {
      completionStatus: 'complete' as const,
      scoreValidity: 'valid' as const,
      issues: [ambiguousA, ambiguousB],
    }) as ProjectReport;
    ambiguous.firstScan = projectFirstScan(ambiguous, {
      cwd: '/workspace',
      configHash: 'config-a',
    });
    ambiguous.issues = [ambiguousB, ambiguousA];
    const ambiguousOutput = formatPretty(ambiguous, { full: true });

    expect(ambiguousOutput).not.toContain('AMBIGUOUS_A');
    expect(ambiguousOutput).not.toContain('AMBIGUOUS_B');
  });

  it('omits exact evidence when cwd identity does not match the projected finding', () => {
    const original: Issue = {
      ...activeIssue,
      ruleId: 'logic/replaced-finding',
      category: 'logic',
      filePath: '/workspace/src/replaced.ts',
      evidence: {
        kind: 'matched-source-span',
        status: 'exact',
        snippet: 'ORIGINAL_EXACT_SNIPPET',
        location: { start: { line: 1, column: 1 }, end: { line: 1, column: 8 } },
        matched: { field: 'fixture', key: 'original', value: 'ORIGINAL_EXACT_SNIPPET' },
      },
    };
    const input = Object.assign(report(), {
      completionStatus: 'complete' as const,
      scoreValidity: 'valid' as const,
      issues: [original],
    }) as ProjectReport;
    input.firstScan = projectFirstScan(input, {
      cwd: '/workspace',
      configHash: 'config-a',
    });
    input.issues = [{
      ...original,
      message: 'A different finding now occupies this location.',
      evidence: {
        ...original.evidence!,
        snippet: 'UNTRUSTWORTHY_REPLACEMENT',
      },
    }];

    const output = formatPretty(input, { full: true, cwd: '/workspace' });
    expect(output).not.toContain('UNTRUSTWORTHY_REPLACEMENT');
  });

  it.each([
    ['not-applicable', { completionStatus: 'empty', scoreValidity: 'not-applicable', requested: 0, analyzed: 0, failed: 0, skipped: 0 }],
    ['incomplete', { completionStatus: 'partial', scoreValidity: 'incomplete', requested: 2, analyzed: 1, failed: 1, skipped: 0 }],
  ] as const)('checks %s validity before direct heatmap dispatch', async (_label, validity) => {
    const input = Object.assign(report(), validity) as ProjectReport;
    const logged: string[] = [];
    const spy = vi.spyOn(console, 'log').mockImplementation((value) => {
      logged.push(String(value));
    });
    try {
      await outputScanResults(input, { heatmap: true, format: 'pretty' }, process.cwd());
    } finally {
      spy.mockRestore();
    }

    expect(logged.join('\n')).toContain(
      validity.scoreValidity === 'not-applicable' ? 'scores are not applicable' : 'INCOMPLETE SCAN',
    );
    expect(logged.join('\n')).not.toMatch(/ROI\s+Score/);
  });

  it('keeps direct human renderers score-free for a not-applicable scan', () => {
    const input = Object.assign(report(), {
      completionStatus: 'empty' as const,
      scoreValidity: 'not-applicable' as const,
      reason: 'no-files-analyzed' as const,
      requested: 0,
      analyzed: 0,
      failed: 0,
      skipped: 0,
    }) as ProjectReport;
    const machineInput = { ...input } as ProjectReport;
    machineInput.firstScan = projectFirstScan(machineInput, {
      cwd: '/workspace',
      configHash: 'config-a',
    });
    const json = JSON.parse(formatJson(machineInput)) as {
      firstScan?: { status: string; headline: unknown; recommendedActions: unknown[] };
      repositoryHealth?: number;
    };
    const sarif = JSON.parse(formatSarif(machineInput)) as {
      runs: Array<{
        tool: {
          driver: {
            properties?: {
              firstScan?: { status: string; headline: unknown; recommendationCount: number };
              scores?: unknown;
            };
          };
        };
      }>;
    };
    const notice = 'NO FILES ANALYSED — scores are not applicable for gating.';

    expect(json.firstScan).toMatchObject({ status: 'not-applicable', headline: null });
    expect(json.firstScan?.recommendedActions).toEqual([]);
    expect(json).not.toHaveProperty('repositoryHealth');
    expect(sarif.runs[0]!.tool.driver.properties?.firstScan).toMatchObject({
      status: 'not-applicable',
      headline: null,
      recommendationCount: 0,
    });
    expect(sarif.runs[0]!.tool.driver.properties).not.toHaveProperty('scores');

    for (const output of [
      formatPretty(input),
      formatBriefReport(input),
      formatWhyFailingReport(input),
      formatMarkdown(input),
    ]) {
      expect(output).toContain(notice);
      expect(output).not.toMatch(
        /AI Slop Score|Engineering Hygiene|Repository Health|Threshold \(CI gate\)|Score is clean|Nothing is failing the threshold/i,
      );
    }
  });

  it('marks incomplete scans as invalid and suppresses machine headline scores', () => {
    const input = Object.assign(report(), {
      completionStatus: 'partial' as const,
      // Added by the scan completion contract. Keep this structural here so
      // the assertion proves renderer behaviour before the type lands.
      scoreValidity: 'incomplete' as const,
      requested: 7,
      analyzed: 6,
      failed: 1,
      skipped: 0,
      compositeScore: {
        mean: 0.72,
        max: 0.91,
        tier: 'LIKELY_AI' as const,
        fileCount: 1,
      },
      scanAccounting: {
        selected: 7,
        analyzed: 6,
        zeroFinding: 6,
        incrementalCached: 0,
        parseFailed: 1,
        timedOut: 0,
        crashed: 0,
        internalFailed: 0,
      },
      selectionAccounting: {
        observedCandidates: 9,
        selected: 7,
        excluded: {
          configExclude: 1,
          unsupportedFileType: 0,
          extensionlessDuplicate: 0,
          outsideWorkspace: 0,
          gitScope: 1,
        },
      },
    }) as ProjectReport;
    const machineInput = { ...input } as ProjectReport;
    machineInput.firstScan = projectFirstScan(machineInput, {
      cwd: '/workspace',
      configHash: 'config-a',
    });
    const json = JSON.parse(formatJson(machineInput)) as Record<string, unknown>;
    const sarif = JSON.parse(formatSarif(machineInput)) as {
      runs: Array<{ tool: { driver: { properties?: Record<string, unknown> } } }>;
    };

    expect(json).toMatchObject({
      scoreValidity: 'incomplete',
      completionStatus: 'partial',
      firstScan: { status: 'incomplete', headline: null },
    });
    expect((json.firstScan as { recommendedActions: unknown[] }).recommendedActions).toEqual([]);
    for (const field of ['aiSlopScore', 'engineeringHygiene', 'security', 'repositoryHealth']) {
      expect(json).not.toHaveProperty(field);
    }
    expect(sarif.runs[0].tool.driver.properties).toMatchObject({
      scoreValidity: 'incomplete',
      completionStatus: 'partial',
      scanAccounting: { selected: 7, analyzed: 6, parseFailed: 1 },
      selectionAccounting: { observedCandidates: 9, selected: 7, excluded: { gitScope: 1 } },
      firstScan: { status: 'incomplete', headline: null, recommendationCount: 0 },
    });
    expect(sarif.runs[0].tool.driver.properties?.scores).toBeUndefined();
    for (const output of [
      formatPretty(input),
      formatBriefReport(input),
      formatWhyFailingReport(input),
      formatMarkdown(input),
      formatHtml(input),
    ]) {
      expect(output).toContain('INCOMPLETE SCAN');
      expect(output).toContain('not valid for gating');
      expect(output).toContain('requested 7');
      expect(output).not.toMatch(/AI Slop Score:|Repository Health:|Threshold \(CI gate\)|Score is clean|Nothing is failing the threshold/i);
    }
    expect(formatPretty(input)).toContain('requested 7; analyzed 6; failed 1; skipped 0');
    expect(formatBriefReport(input)).toContain('requested 7; analyzed 6; failed 1; skipped 0');
    for (const output of [formatPretty(input), formatBriefReport(input), formatMarkdown(input)]) {
      expect(output).toContain('zero findings 6');
      expect(output).toContain('excluded 2');
      expect(output).toContain('failures (parse 1, timeout 0, crash 0, internal 0)');
    }
    expect(formatBriefReport(input)).toContain(
      'SCAN STATUS: incomplete (scan/runtime failure) — policy gate not evaluated.',
    );
  });

  it('labels threshold failures as policy outcomes and summarizes active rules in brief output', () => {
    const activeRules = Array.from({ length: 6 }, (_, index) => ({
      ...activeIssue,
      ruleId: `test/rule-${index}`,
      filePath: `src/active-${index}.ts`,
    }));
    const input = Object.assign(report(), {
      aiSlopScore: 42,
      thresholds: { meanSlop: 15, p90Slop: 30, individualSlopThreshold: 60 },
      issues: [...activeRules, offIssue],
    }) as ProjectReport;

    const output = formatBriefReport(input);

    expect(output).toContain('CI gate: AI Slop Score <= 15 -> fail (policy threshold)');
    expect(output).toContain('Active rules (6):');
    expect(output).toContain('test/rule-0 × 1');
    expect(output).toContain('+ 1 more rule');
    expect(output).not.toContain('test/off-rule');
  });

  it('treats a legacy partial completion marker as incomplete in Markdown', () => {
    const input = Object.assign(report(), {
      // Older producers copied completionStatus but not scoreValidity.
      completionStatus: 'partial' as const,
    }) as ProjectReport;

    const output = formatMarkdown(input);

    expect(output).toContain('- **Completion status:** partial');
    expect(output).toContain('- **Score validity:** incomplete');
    expect(output).not.toContain('- **Score validity:** not-applicable');
  });

  it('preserves all four score values and score-basis provenance in every report format', () => {
    const input = report();
    const json = JSON.parse(formatJson(input)) as Record<string, unknown>;
    const sarif = JSON.parse(formatSarif(input)) as { runs: Array<{ tool: { driver: { properties?: Record<string, unknown> } } }> };
    const textFormats = [formatMarkdown(input), formatPretty(input), formatBriefReport(input), formatHtml(input)];

    expect(json).toMatchObject({
      aiSlopScore: 12.3,
      engineeringHygiene: 45.6,
      security: 78.9,
      repositoryHealth: 63.4,
      scoreBasis,
    });
    expect(sarif.runs[0].tool.driver.properties).toMatchObject({
      scores: { aiSlopScore: 12.3, engineeringHygiene: 45.6, security: 78.9, repositoryHealth: 63.4 },
      scoreBasis,
    });
    for (const output of textFormats) {
      expect(output).toContain('AI Slop Score');
      expect(output).toContain('Engineering Hygiene');
      expect(output).toContain('Security');
      expect(output).toContain('Repository Health');
      expect(output).toContain('12.3');
      expect(output).toContain('45.6');
      expect(output).toContain('78.9');
      expect(output).toContain('63.4');
      expect(output).toContain('7 successfully analysed files');
      expect(output).toContain('effective findings only');
      expect(output).toContain('2 suppressed');
      expect(output).toContain('1 parse errors');
    }
  });

  it('shows detailed accounting in valid Markdown and HTML reports when available', () => {
    const input = Object.assign(report(), {
      scoreBasis: { ...scoreBasis, parseErrorCount: 0 },
      requested: 7,
      analyzed: 7,
      failed: 0,
      skipped: 0,
      scanAccounting: {
        selected: 7,
        analyzed: 7,
        zeroFinding: 5,
        incrementalCached: 0,
        parseFailed: 0,
        timedOut: 0,
        crashed: 0,
        internalFailed: 0,
      },
      selectionAccounting: {
        observedCandidates: 8,
        selected: 7,
        excluded: {
          configExclude: 1,
          unsupportedFileType: 0,
          extensionlessDuplicate: 0,
          outsideWorkspace: 0,
          gitScope: 0,
        },
      },
    }) as ProjectReport;

    const expected = 'Accounting: requested 7; analyzed 7; zero findings 5; excluded 1; failures (parse 0, timeout 0, crash 0, internal 0); cached 0.';
    expect(formatMarkdown(input)).toContain(expected);
    expect(formatHtml(input)).toContain(expected);
  });

  it('does not invent zero-finding or failure counts without scan accounting', () => {
    const input = Object.assign(report(), {
      requested: 7,
      analyzed: 7,
      failed: 0,
      skipped: 0,
      selectionAccounting: {
        observedCandidates: 8,
        selected: 7,
        excluded: {
          configExclude: 1,
          unsupportedFileType: 0,
          extensionlessDuplicate: 0,
          outsideWorkspace: 0,
          gitScope: 0,
        },
      },
    }) as ProjectReport;

    for (const output of [formatMarkdown(input), formatHtml(input)]) {
      expect(output).toContain('zero findings n/a');
      expect(output).toContain('failures (n/a)');
      expect(output).not.toContain('zero findings 0');
    }
  });

  it('keeps bounded finding evidence useful across machine and human report surfaces', () => {
    const evidenceIssue: Issue = {
      ...activeIssue,
      ruleId: 'typo/placeholder-text',
      category: 'typo',
      message: 'Placeholder text "TODO" is unfinished.',
      evidence: {
        kind: 'matched-source-span',
        status: 'exact',
        snippet: 'placeholder="TODO"',
        location: { start: { line: 1, column: 8 }, end: { line: 1, column: 25 } },
        matched: { field: 'placeholder', key: 'placeholder', value: 'TODO' },
      },
    };
    const input = Object.assign(report(), { issues: [evidenceIssue] }) as ProjectReport;
    const json = JSON.parse(formatJson(input)) as { issues: Array<{ evidence?: unknown }> };
    const sarif = JSON.parse(formatSarif(input)) as {
      runs: Array<{ results: Array<{ properties?: { evidence?: unknown } }> }>;
    };
    const markdown = formatMarkdown(input);
    const pretty = formatPretty(input);

    expect(json.issues[0]?.evidence).toEqual(evidenceIssue.evidence);
    expect(sarif.runs[0]?.results[0]?.properties?.evidence).toEqual(evidenceIssue.evidence);
    expect(markdown).toContain('evidence: `placeholder="TODO"`');
    expect(markdown).toContain('1:8-1:25');
    expect(pretty).toContain('Evidence: placeholder="TODO" (1:8-1:25)');
  });

  it('uses one truthful score explanation and keeps disabled findings out of HTML only', () => {
    const input = report();
    const formula = '0.4 × (100 − AI Slop Score) + 0.3 × Engineering Hygiene + 0.2 × Security + 0.1 × Test Quality';
    const json = JSON.parse(formatJson(input)) as { scoreBriefs: Record<string, string> };
    const markdown = formatMarkdown(input);
    const pretty = formatPretty(input);
    const brief = formatBriefReport(input);
    const html = formatHtml(input);
    const sarif = JSON.parse(formatSarif(input)) as { runs: Array<{ results: Array<{ ruleId: string }> }> };

    expect(json.scoreBriefs.repositoryHealth).toContain(formula);
    for (const output of [markdown, pretty, brief, html]) expect(output).toContain(formula);
    expect(html).toContain('test/active-rule');
    expect(html).not.toContain('test/off-rule');
    expect(json.issues).toEqual(expect.arrayContaining([expect.objectContaining({ ruleId: 'test/off-rule' })]));
    expect(sarif.runs[0].results).toEqual(expect.arrayContaining([expect.objectContaining({ ruleId: 'test/off-rule' })]));
  });

  it('gives MCP suggestions the same validity/accounting contract without incomplete headline scores', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'slopbrick-renderer-contract-'));
    try {
      mkdirSync(join(cwd, '.slopbrick'), { recursive: true });
      writeFileSync(join(cwd, '.slopbrick', 'health.json'), JSON.stringify({
        version: STRUCTURE_SCHEMA_VERSION,
        generatedAt: '2026-07-10T00:00:00.000Z',
        workspace: cwd,
        aiSlopScore: 12,
        engineeringHygiene: 46,
        security: 79,
        repositoryHealth: 63,
        compositeScore: {
          mean: 0.72,
          max: 0.91,
          tier: 'LIKELY_AI',
          fileCount: 6,
        },
        issueCounts: { high: 0, medium: 0, low: 0 },
        scoreBasis,
        completionStatus: 'partial',
        scoreValidity: 'incomplete',
        requested: 7,
        analyzed: 6,
        failed: 1,
        skipped: 0,
        scanAccounting: {
          selected: 7, analyzed: 6, zeroFinding: 6, incrementalCached: 0,
          parseFailed: 1, timedOut: 0, crashed: 0, internalFailed: 0,
        },
        selectionAccounting: {
          observedCandidates: 9,
          selected: 7,
          excluded: {
            configExclude: 1, unsupportedFileType: 0, extensionlessDuplicate: 0,
            outsideWorkspace: 0, gitScope: 1,
          },
        },
      }), 'utf8');

      const ctx: ToolContext = {
        cwd,
        rules: [],
        config: DEFAULT_CONFIG as ResolvedConfig,
      };
      const result = await runSuggest({}, ctx);
      const payload = JSON.parse(result.content[0]!.text) as Record<string, unknown>;

      expect(payload.scores).toBeUndefined();
      expect(payload.compositeScore).toBeUndefined();
      expect(payload).toMatchObject({
        completionStatus: 'partial',
        scoreValidity: 'incomplete',
        scanAccounting: { selected: 7, analyzed: 6, parseFailed: 1 },
        selectionAccounting: { observedCandidates: 9, selected: 7, excluded: { gitScope: 1 } },
      });
      expect(payload.scoreBasis).toEqual(scoreBasis);
      expect(payload).toMatchObject({
        completionStatus: 'partial',
        scoreValidity: 'incomplete',
        scanAccounting: { selected: 7, analyzed: 6, parseFailed: 1 },
      });
      expect(payload.scoreBriefs).toEqual(SCORE_BRIEFS);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
