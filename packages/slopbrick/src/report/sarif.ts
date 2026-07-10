import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { basename, isAbsolute, relative, resolve } from 'node:path';
import type { Category, Issue, ProjectReport, Severity } from '../types';

interface SarifArtifactLocation {
  uri: string;
}

interface SarifRegion {
  startLine: number;
  startColumn: number;
  /**
   * SARIF 2.1.0 §3.30.6 — byte offset (UTF-8) of the region start.
   * Optional in the spec; emitted when the source file is readable
   * from the SARIF formatter so code-scanning platforms can resolve
   * regions without re-running the parser.
   */
  startByte?: number;
  /** Byte offset one past the last byte of the region. */
  endByte?: number;
}

interface SarifPhysicalLocation {
  artifactLocation: SarifArtifactLocation;
  region: SarifRegion;
}

interface SarifLocation {
  physicalLocation: SarifPhysicalLocation;
}

interface SarifMessage {
  text: string;
}

interface SarifRule {
  id: string;
  name: string;
  helpUri?: string;
  shortDescription: {
    text: string;
  };
  properties: {
    aiSpecific: boolean;
    category: Category;
    severity: Severity;
  };
}

interface SarifResultProperties {
  aiSpecific: boolean;
  category: Category;
  severity: Severity;
}

interface SarifPartialFingerprints {
  /**
   * SARIF 2.1.0 §3.27.5 — stable identifier for a finding across runs.
   * Consumers use this to deduplicate alerts. We derive the value from
   * `(ruleId, file, line, column, category)` so it does NOT change when
   * an upstream rule's prose message is edited — the underlying finding
   * is unchanged.
   */
  primaryLocationLineHash: string;
}

type SarifLevel = 'error' | 'warning' | 'note' | 'none';

interface SarifResult {
  ruleId: string;
  level: SarifLevel;
  message: SarifMessage;
  locations: SarifLocation[];
  /**
   * SARIF 2.1.0 §3.27.9 — per-result helpUri (preferred over the
   * rule-level helpUri when set, since some platforms surface this
   * directly on the alert row).
   */
  helpUri?: string;
  properties: SarifResultProperties;
  partialFingerprints: SarifPartialFingerprints;
}

interface SarifToolDriver {
  name: string;
  version: string;
  informationUri: string;
  rules: SarifRule[];
  /**
   * SARIF 2.1.0 §3.18 — the `properties` bag on a tool driver is
   * free-form key/value. Sprint 2.3 §2b.1 uses it to surface the
   * project-level Bayesian composite aggregate (tier, mean, max,
   * fileCount) so SARIF consumers (GitHub code scanning, IDE
   * security panels) can display the "is this codebase AI?"
   * probability alongside the per-result findings. The four deterministic
   * headline scores are always present; optional metadata is added when the
   * report carries it.
   */
  properties?: {
    compositeScore?: {
      tier: 'LIKELY_HUMAN' | 'INCONCLUSIVE' | 'LIKELY_AI' | 'VERY_LIKELY_AI';
      mean: number;
      max: number;
      fileCount: number;
    };
    scoreBasis?: NonNullable<ProjectReport['scoreBasis']>;
    /** Headline values carried with SARIF so integrations retain scan context. */
    scores?: Pick<ProjectReport, 'aiSlopScore' | 'engineeringHygiene' | 'security' | 'repositoryHealth'>;
  };
}

interface SarifTool {
  driver: SarifToolDriver;
}

interface SarifRun {
  tool: SarifTool;
  results: SarifResult[];
}

interface SarifLog {
  $schema: string;
  version: string;
  runs: SarifRun[];
}

// The org is `usebrick`; the monorepo is `usebrick/platform`; slopbrick is
// the published CLI package inside it. Keep these in sync with explain.ts.
const REPO_INFORMATION_URI = 'https://github.com/usebrick/platform';
const RULES_BASE_URL = 'https://github.com/usebrick/platform/blob/main/packages/slopbrick/src/rules';

function buildArtifactUri(filePath: string | undefined, cwd: string | undefined): string {
  if (!filePath) {
    return '.';
  }
  if (cwd) {
    const absoluteFilePath = isAbsolute(filePath) ? filePath : resolve(cwd, filePath);
    const rel = relative(cwd, absoluteFilePath);
    if (rel.startsWith('..')) {
      return basename(filePath);
    }
    return rel;
  }
  if (isAbsolute(filePath)) {
    return basename(filePath);
  }
  return filePath;
}

/**
 * Resolve a file path for reading source bytes, mirroring `buildArtifactUri`'s
 * cwd semantics. Returns `null` when the path cannot be located on disk
 * (e.g. issues emitted without a filePath, or relative paths passed
 * without a `cwd`).
 */
function resolveSourcePath(filePath: string | undefined, cwd: string | undefined): string | null {
  if (!filePath) return null;
  if (cwd) {
    return isAbsolute(filePath) ? filePath : resolve(cwd, filePath);
  }
  return isAbsolute(filePath) ? filePath : null;
}

/**
 * SARIF 2.1.0 §3.27.10 — map slopbrick's severity labels onto the four
 * SARIF levels. The `auto` and `off` states are config-level values
 * (rules can be disabled or auto-tuned); if an issue carrying those
 * states is rendered, we surface it at `none` so consumers do not
 * fail the build on a finding that the tool itself has silenced.
 */
function severityToSarifLevel(severity: Severity | 'auto' | 'off'): SarifLevel {
  switch (severity) {
    case 'high':
      return 'error';
    case 'medium':
      return 'warning';
    case 'low':
      return 'note';
    case 'auto':
    case 'off':
      return 'none';
    default:
      return 'warning';
  }
}

/**
 * Convert a `(line, column)` pair to byte offsets within a UTF-8 buffer.
 *
 * SARIF 2.1.0 §3.30.6 / §3.30.7 — `startByte` and `endByte` are 0-based
 * byte offsets relative to the artifact start. `column` follows SARIF's
 * 1-based column convention. Multi-byte UTF-8 sequences are handled by
 * slicing the buffer (which is byte-addressed) and clamping the column
 * to the line's actual byte length. `endByte` defaults to `startByte + 1`
 * — we don't know the exact token span from an `Issue` alone.
 */
function computeByteOffset(
  content: string,
  line: number,
  column: number,
): { startByte: number; endByte: number } {
  const buffer = Buffer.from(content, 'utf-8');
  const newline = 0x0a;

  let lineStart = 0;
  let currentLine = 1;
  for (let byteIdx = 0; byteIdx < buffer.length && currentLine < line; byteIdx++) {
    if (buffer[byteIdx] === newline) {
      lineStart = byteIdx + 1;
      currentLine++;
    }
  }

  // Line beyond EOF — clamp to end-of-file byte.
  if (currentLine < line) {
    return { startByte: buffer.length, endByte: buffer.length + 1 };
  }

  const lineSlice = buffer.slice(lineStart);
  const newlineAt = lineSlice.indexOf(newline);
  const lineByteLength = newlineAt === -1 ? lineSlice.length : newlineAt;
  const colOffset = Math.max(0, column - 1);
  const clampedColOffset = Math.min(colOffset, lineByteLength);
  const startByte = lineStart + clampedColOffset;
  return { startByte, endByte: startByte + 1 };
}

function ruleIdToFilename(ruleId: string): string {
  // e.g. 'logic/boundary-violation' -> 'boundary-violation'
  const slash = ruleId.indexOf('/');
  return slash === -1 ? ruleId : ruleId.slice(slash + 1);
}

function buildHelpUri(ruleId: string, category: Category): string {
  return `${RULES_BASE_URL}/${category}/${ruleIdToFilename(ruleId)}.ts`;
}

/**
 * Stable, deterministic fingerprint for a finding. Inputs deliberately
 * exclude `issue.message` so a prose edit to the rule description does
 * not invalidate every historical fingerprint.
 *
 * SARIF 2.1.0 §3.27.5 — fingerprint should be stable across runs when
 * the underlying finding has not changed.
 */
function computeFingerprint(input: {
  ruleId: string;
  fileUri: string;
  line: number;
  column: number;
  category: Category;
}): string {
  const payload = `${input.ruleId}|${input.fileUri}|${input.line}|${input.column}|${input.category}`;
  return createHash('sha256').update(payload).digest('hex').slice(0, 16);
}

function buildRuleFromIssue(issue: Issue): SarifRule {
  return {
    id: issue.ruleId,
    name: issue.ruleId,
    helpUri: buildHelpUri(issue.ruleId, issue.category),
    shortDescription: {
      text: issue.ruleId,
    },
    properties: {
      aiSpecific: issue.aiSpecific,
      category: issue.category,
      severity: issue.severity,
    },
  };
}

function buildResultFromIssue(
  issue: Issue,
  cwd: string | undefined,
  fileContentCache: Map<string, string>,
): SarifResult {
  const artifactUri = buildArtifactUri(issue.filePath, cwd);
  const fingerprint = computeFingerprint({
    ruleId: issue.ruleId,
    fileUri: artifactUri,
    line: issue.line ?? 1,
    column: issue.column ?? 1,
    category: issue.category,
  });

  const region: SarifRegion = {
    startLine: issue.line ?? 1,
    startColumn: issue.column ?? 1,
  };

  const sourcePath = resolveSourcePath(issue.filePath, cwd);
  if (sourcePath) {
    let content = fileContentCache.get(sourcePath);
    if (content === undefined) {
      try {
        content = readFileSync(sourcePath, 'utf-8');
        fileContentCache.set(sourcePath, content);
      } catch {
        // Negative-cache so we don't re-try on every subsequent issue.
        fileContentCache.set(sourcePath, '');
        content = '';
      }
    }
    if (content && content.length > 0) {
      const { startByte, endByte } = computeByteOffset(content, region.startLine, region.startColumn);
      region.startByte = startByte;
      region.endByte = endByte;
    }
  }

  const properties: SarifResultProperties = {
    aiSpecific: issue.aiSpecific,
    category: issue.category,
    severity: issue.severity,
  };

  return {
    ruleId: issue.ruleId,
    level: severityToSarifLevel(issue.severity),
    message: {
      text: issue.message,
    },
    locations: [
      {
        physicalLocation: {
          artifactLocation: {
            uri: artifactUri,
          },
          region,
        },
      },
    ],
    helpUri: buildHelpUri(issue.ruleId, issue.category),
    properties,
    partialFingerprints: {
      primaryLocationLineHash: fingerprint,
    },
  };
}

export function formatSarif(
  report: ProjectReport,
  options?: { cwd?: string },
): string {
  const rulesById = new Map<string, SarifRule>();
  for (const issue of report.issues) {
    if (!rulesById.has(issue.ruleId)) {
      rulesById.set(issue.ruleId, buildRuleFromIssue(issue));
    }
  }

  const rules = Array.from(rulesById.values()).sort((a, b) => a.id.localeCompare(b.id));
  // One read per file, even when many issues share the same source.
  const fileContentCache = new Map<string, string>();
  const results = report.issues.map((issue) =>
    buildResultFromIssue(issue, options?.cwd, fileContentCache),
  );

  // Every ProjectReport carries the deterministic headline scores, so every
  // SARIF log carries them too. The Bayesian aggregate and score provenance
  // remain optional for historical/programmatic reports that lack them.
  const driverProperties = {
    ...(report.compositeScore ? { compositeScore: report.compositeScore } : {}),
    ...(report.scoreBasis ? { scoreBasis: report.scoreBasis } : {}),
    scores: {
      aiSlopScore: report.aiSlopScore,
      engineeringHygiene: report.engineeringHygiene,
      security: report.security,
      repositoryHealth: report.repositoryHealth,
    },
  };

  const log: SarifLog = {
    $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
    version: '2.1.0',
    runs: [
      {
        tool: {
          driver: {
            name: 'slopbrick',
            version: report.version,
            informationUri: REPO_INFORMATION_URI,
            rules,
            ...(driverProperties ? { properties: driverProperties } : {}),
          },
        },
        results,
      },
    ],
  };

  return JSON.stringify(log, null, 2);
}
