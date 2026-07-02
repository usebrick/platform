import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { formatSarif } from '../../src/report/sarif';
import { VERSION, type Issue, type ProjectReport, type Severity } from '../../src/types';

function makeReport(overrides: Partial<ProjectReport> = {}): ProjectReport {
  return {
    version: VERSION,
    generatedAt: '2026-06-25T00:00:00.000Z',
    aiSlopScore: 30, engineeringHygiene: 30, security: 30, repositoryHealth: 30,
    assemblyHealth: 70,
    totalScore: 0,
    categoryScores: { visual: 0, typo: 0, wcag: 0, layout: 0, component: 0, logic: 0, arch: 0, perf: 0, security: 0, test: 0, docs: 0, db: 0, ai: 0, context: 0, product: 0, i18n: 0 },
    boundaryScore: 0,
    contextScore: 0,
    visualScore: 0,
    subscores: {},
    p90Score: 0,
    peakScore: 0,
    componentCount: 0,
    fileCount: 0,
    components: [],
    issues: [],
    thresholds: { meanSlop: 15, p90Slop: 30, individualSlopThreshold: 60 },
    ...overrides,
  };
}

const sampleIssue: Issue = {
  ruleId: 'logic/boundary-violation',
  category: 'logic',
  severity: 'high',
  aiSpecific: true,
  filePath: 'src/Card.tsx',
  message: 'Test issue',
  line: 5,
  column: 3,
};

// ---------- SARIF 2.1.0 structural shape ----------

describe('formatSarif — SARIF 2.1.0 envelope', () => {
  it('declares version 2.1.0 and slopbrick as the tool driver', () => {
    const json = formatSarif(makeReport({ issues: [sampleIssue] }));
    const log = JSON.parse(json) as {
      version: string;
      runs: Array<{ tool: { driver: { name: string; version: string } } }>;
    };
    expect(log.version).toBe('2.1.0');
    expect(log.runs[0].tool.driver.name).toBe('slopbrick');
    expect(log.runs[0].tool.driver.version).toBe(VERSION);
  });

  it('emits valid SARIF JSON', () => {
    const out = formatSarif(makeReport({ issues: [sampleIssue] }));
    expect(() => JSON.parse(out)).not.toThrow();
  });

  it('produces a SARIF run with results: [] when there are no issues', () => {
    const log = JSON.parse(formatSarif(makeReport())) as { runs: Array<{ results: unknown[]; tool: { driver: { rules: unknown[] } } }> };
    expect(log.runs[0].results).toEqual([]);
    expect(log.runs[0].tool.driver.rules).toEqual([]);
  });
});

// ---------- Per-result shape ----------

describe('formatSarif — result shape', () => {
  it('populates ruleId, level, message.text, and locations[0].physicalLocation', () => {
    const log = JSON.parse(formatSarif(makeReport({ issues: [sampleIssue] }))) as {
      runs: Array<{
        results: Array<{
          ruleId: string;
          level: string;
          message: { text: string };
          locations: Array<{ physicalLocation: unknown }>;
        }>;
      }>;
    };
    const result = log.runs[0].results[0];
    expect(result.ruleId).toBe('logic/boundary-violation');
    expect(result.level).toBe('error');
    expect(result.message.text).toBe('Test issue');
    expect(result.locations[0].physicalLocation).toBeDefined();
  });

  it('emits helpUri on every result, defaulting to the rule source URL', () => {
    const log = JSON.parse(formatSarif(makeReport({ issues: [sampleIssue] }))) as {
      runs: Array<{ results: Array<{ helpUri: string }> }>;
    };
    const result = log.runs[0].results[0];
    expect(result.helpUri).toMatch(/^https:\/\/github\.com\/Dystx\/slopbrick\/blob\/main\/src\/rules\/logic\/boundary-violation\.ts$/);
  });

  it('emits the same helpUri on the rule and its result', () => {
    const log = JSON.parse(formatSarif(makeReport({ issues: [sampleIssue] }))) as {
      runs: Array<{
        tool: { driver: { rules: Array<{ helpUri?: string }> } };
        results: Array<{ helpUri?: string }>;
      }>;
    };
    const rule = log.runs[0].tool.driver.rules[0];
    const result = log.runs[0].results[0];
    expect(result.helpUri).toBe(rule.helpUri);
  });

  it('emits a non-empty helpUri on visual rules in their category', () => {
    const issue: Issue = { ...sampleIssue, ruleId: 'visual/math-default-font', category: 'visual' };
    const log = JSON.parse(formatSarif(makeReport({ issues: [issue] }))) as {
      runs: Array<{ results: Array<{ helpUri: string }> }>;
    };
    expect(log.runs[0].results[0].helpUri).toContain('/visual/math-default-font.ts');
  });
});

// ---------- Byte offsets in physicalLocation ----------

describe('formatSarif — byte offsets in region', () => {
  it('emits startByte and endByte when the source file is readable', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sarif-bytes-'));
    try {
      // 6 lines, 5 bytes each ("abcde\n"); line 3, column 4 = byte 17 ('d' on line 3).
      const filePath = join(dir, 'src.ts');
      writeFileSync(filePath, 'abcde\nfghij\nklmno\npqrst\nuvwxy\nzzzzz\n');
      const issue: Issue = {
        ...sampleIssue,
        filePath,
        line: 3,
        column: 4,
      };
      const log = JSON.parse(formatSarif(makeReport({ issues: [issue] }), { cwd: dir })) as {
        runs: Array<{
          results: Array<{
            locations: Array<{
              physicalLocation: {
                artifactLocation: { uri: string };
                region: { startLine: number; startColumn: number; startByte?: number; endByte?: number };
              };
            }>;
          }>;
        }>;
      };
      const region = log.runs[0].results[0].locations[0].physicalLocation.region;
      expect(region.startLine).toBe(3);
      expect(region.startColumn).toBe(4);
      // "abcde\n" (6) + "fghij\n" (6) = byte 12 starts line 3.
      // Column 4 on "klmno" is the 'o' at byte 12 + 3 = 15.
      expect(region.startByte).toBe(15);
      expect(region.endByte).toBe(16);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('handles multi-byte UTF-8 by addressing bytes, not characters', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sarif-utf8-'));
    try {
      const filePath = join(dir, 'utf8.ts');
      // 'é' encodes to 2 bytes in UTF-8 (0xC3 0xA9). Line 1: "aé\n" — 4 bytes.
      // Line 2: "b\n" — 2 bytes. Line 2 column 1 = byte 4.
      writeFileSync(filePath, 'aé\nb\n', 'utf-8');
      const issue: Issue = {
        ...sampleIssue,
        filePath,
        line: 2,
        column: 1,
      };
      const log = JSON.parse(formatSarif(makeReport({ issues: [issue] }), { cwd: dir })) as {
        runs: Array<{
          results: Array<{
            locations: Array<{
              physicalLocation: {
                region: { startByte?: number; endByte?: number };
              };
            }>;
          }>;
        }>;
      };
      const region = log.runs[0].results[0].locations[0].physicalLocation.region;
      expect(region.startByte).toBe(4);
      expect(region.endByte).toBe(5);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('clamps byte offsets when line is past EOF rather than throwing', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sarif-eof-'));
    try {
      const filePath = join(dir, 'short.ts');
      writeFileSync(filePath, 'one line\n');
      const issue: Issue = {
        ...sampleIssue,
        filePath,
        line: 9999,
        column: 1,
      };
      const log = JSON.parse(formatSarif(makeReport({ issues: [issue] }), { cwd: dir })) as {
        runs: Array<{
          results: Array<{
            locations: Array<{
              physicalLocation: {
                region: { startByte?: number; endByte?: number };
              };
            }>;
          }>;
        }>;
      };
      const region = log.runs[0].results[0].locations[0].physicalLocation.region;
      expect(region.startByte).toBe(9); // 8 bytes of "one line" + 1 newline
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('omits byte offsets gracefully when the source file cannot be read', () => {
    const log = JSON.parse(formatSarif(makeReport({ issues: [sampleIssue] }), { cwd: '/nonexistent' })) as {
      runs: Array<{
        results: Array<{
          locations: Array<{
            physicalLocation: {
              region: { startByte?: number; endByte?: number };
            };
          }>;
        }>;
      }>;
    };
    const region = log.runs[0].results[0].locations[0].physicalLocation.region;
    expect(region.startByte).toBeUndefined();
    expect(region.endByte).toBeUndefined();
  });
});

// ---------- Severity → SARIF level mapping ----------

describe('formatSarif — severity → level mapping (SARIF 2.1.0 §3.27.10)', () => {
  const expected: Array<[Severity, string]> = [
    ['high', 'error'],
    ['medium', 'warning'],
    ['low', 'note'],
  ];
  for (const [severity, level] of expected) {
    it(`maps severity "${severity}" → level "${level}"`, () => {
      const issue: Issue = { ...sampleIssue, severity };
      const log = JSON.parse(formatSarif(makeReport({ issues: [issue] }))) as {
        runs: Array<{ results: Array<{ level: string }> }>;
      };
      expect(log.runs[0].results[0].level).toBe(level);
    });
  }

  it('maps disabled/config-off rules to level "none"', () => {
    // Severity is typed as 'low' | 'medium' | 'high' on Issue, but the
    // SARIF formatter also handles the config-level 'auto' and 'off'
    // states defensively. Cast via `unknown` to exercise the wider
    // branch without violating the public Issue shape.
    const offIssue = { ...sampleIssue, severity: 'off' as unknown as Severity };
    const autoIssue = { ...sampleIssue, severity: 'auto' as unknown as Severity };
    const log = JSON.parse(formatSarif(makeReport({ issues: [offIssue, autoIssue] }))) as {
      runs: Array<{ results: Array<{ level: string }> }>;
    };
    expect(log.runs[0].results[0].level).toBe('none');
    expect(log.runs[0].results[1].level).toBe('none');
  });
});

// ---------- Stable fingerprint ----------

describe('formatSarif — partialFingerprints.primaryLocationLineHash', () => {
  function fingerprintOf(issue: Issue): string {
    const log = JSON.parse(formatSarif(makeReport({ issues: [issue] }))) as {
      runs: Array<{ results: Array<{ partialFingerprints: { primaryLocationLineHash: string } }> }>;
    };
    return log.runs[0].results[0].partialFingerprints.primaryLocationLineHash;
  }

  it('is deterministic for the same ruleId + file + line + column', () => {
    const a = fingerprintOf(sampleIssue);
    const b = fingerprintOf({ ...sampleIssue });
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{16}$/);
  });

  it('differs when ruleId changes', () => {
    const a = fingerprintOf(sampleIssue);
    const b = fingerprintOf({ ...sampleIssue, ruleId: 'logic/some-other-rule' });
    expect(a).not.toBe(b);
  });

  it('differs when file path changes', () => {
    const a = fingerprintOf(sampleIssue);
    const b = fingerprintOf({ ...sampleIssue, filePath: 'src/Other.tsx' });
    expect(a).not.toBe(b);
  });

  it('differs when line changes', () => {
    const a = fingerprintOf(sampleIssue);
    const b = fingerprintOf({ ...sampleIssue, line: 6 });
    expect(a).not.toBe(b);
  });

  it('differs when column changes', () => {
    const a = fingerprintOf(sampleIssue);
    const b = fingerprintOf({ ...sampleIssue, column: 4 });
    expect(a).not.toBe(b);
  });

  it('is stable when issue.message changes (SARIF 2.1.0 §3.27.5)', () => {
    const before = fingerprintOf({ ...sampleIssue, message: 'Original message text' });
    const after = fingerprintOf({ ...sampleIssue, message: 'Edited message wording in v2 of the rule' });
    expect(before).toBe(after);
  });

  it('is stable when the underlying finding is unchanged across runs', () => {
    const first = formatSarif(makeReport({ issues: [sampleIssue] }));
    const second = formatSarif(makeReport({ issues: [{ ...sampleIssue }] }));
    const firstLog = JSON.parse(first) as { runs: Array<{ results: Array<{ partialFingerprints: { primaryLocationLineHash: string } }> }> };
    const secondLog = JSON.parse(second) as { runs: Array<{ results: Array<{ partialFingerprints: { primaryLocationLineHash: string } }> }> };
    expect(firstLog.runs[0].results[0].partialFingerprints.primaryLocationLineHash).toBe(
      secondLog.runs[0].results[0].partialFingerprints.primaryLocationLineHash,
    );
  });
});