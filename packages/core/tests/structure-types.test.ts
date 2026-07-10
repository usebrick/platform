import { describe, it, expect } from 'vitest';
import {
  STRUCTURE_SCHEMA_VERSION,
  isStructurePattern,
  isComponentFingerprint,
  isInventoryFile,
  isConstitutionFile,
  isHealthFile,
  isFileMtimeEntry,
} from '../src/structure-types';

describe('memory-types — validators', () => {
  it('STRUCTURE_SCHEMA_VERSION is "5"', () => {
    expect(STRUCTURE_SCHEMA_VERSION).toBe('5');
  });

  describe('isStructurePattern', () => {
    it('accepts a valid StructurePattern', () => {
      expect(
        isStructurePattern({
          category: 'stateManagement',
          name: 'zustand',
          imports: ['zustand'],
          fileCount: 5,
        }),
      ).toBe(true);
    });

    it('rejects when category is missing', () => {
      expect(isStructurePattern({ name: 'x', imports: ['x'], fileCount: 1 })).toBe(false);
    });

    it('rejects when imports is not an array of strings', () => {
      expect(
        isStructurePattern({ category: 'stateManagement', name: 'x', imports: 'not-array', fileCount: 1 }),
      ).toBe(false);
    });

    it('rejects categories outside the canonical schema enum', () => {
      expect(
        isStructurePattern({ category: 'unknown', name: 'x', imports: ['x'], fileCount: 1 }),
      ).toBe(false);
    });

    it('rejects null', () => {
      expect(isStructurePattern(null)).toBe(false);
    });
  });

  describe('isComponentFingerprint', () => {
    const valid = {
      name: 'Button',
      files: ['a.tsx'],
      fingerprint: '0123456789abcdef',
      hooks: ['useState'],
      props: ['onClick'],
      line: 1,
      endLine: 10,
    };

    it('accepts a valid ComponentFingerprint', () => {
      expect(isComponentFingerprint(valid)).toBe(true);
    });

    it('rejects when line is missing', () => {
      expect(isComponentFingerprint({ ...valid, line: undefined })).toBe(false);
    });

    it('rejects when props is not an array of strings', () => {
      expect(isComponentFingerprint({ ...valid, props: 'oops' })).toBe(false);
    });
  });

  describe('isInventoryFile', () => {
    const valid = {
      version: STRUCTURE_SCHEMA_VERSION,
      generatedAt: '2026-06-25T00:00:00.000Z',
      workspace: '/tmp',
      scannedFiles: 1,
      scanDurationMs: 100,
      patterns: [],
      components: [],
    };

    it('accepts a valid InventoryFile', () => {
      expect(isInventoryFile(valid)).toBe(true);
    });

    it('rejects when version mismatches', () => {
      expect(isInventoryFile({ ...valid, version: '0' })).toBe(false);
    });

    it('rejects when patterns contains an invalid entry', () => {
      expect(
        isInventoryFile({
          ...valid,
          patterns: [{ category: 'stateManagement', name: 'zustand' }], // missing imports + fileCount
        }),
      ).toBe(false);
    });

    it('rejects values that violate inventory bounds and formats', () => {
      expect(isInventoryFile({ ...valid, generatedAt: 'not-a-date' })).toBe(false);
      expect(isInventoryFile({ ...valid, generatedAt: '2026-02-31T00:00:00.000Z' })).toBe(false);
      expect(isInventoryFile({ ...valid, generatedAt: '0000-02-29T00:00:00.000Z' })).toBe(true);
      expect(isInventoryFile({ ...valid, generatedAt: '0000-02-30T00:00:00.000Z' })).toBe(false);
      expect(isInventoryFile({ ...valid, scannedFiles: 1.5 })).toBe(false);
      expect(
        isInventoryFile({
          ...valid,
          components: [{
            name: 'Button', files: ['a.tsx'], fingerprint: 'not-a-fingerprint',
            hooks: [], props: [], line: 1, endLine: 2,
          }],
        }),
      ).toBe(false);
    });
  });

  describe('isConstitutionFile', () => {
    const valid = {
      version: STRUCTURE_SCHEMA_VERSION,
      generatedAt: '2026-06-25T00:00:00.000Z',
      workspace: '/tmp',
      declared: { stateManagement: 'zustand' },
      forbidden: ['redux'],
      forbiddenPrefixes: ['@scope/'],
    };

    it('accepts a valid ConstitutionFile', () => {
      expect(isConstitutionFile(valid)).toBe(true);
    });

    it('rejects when declared is missing', () => {
      expect(isConstitutionFile({ ...valid, declared: undefined })).toBe(false);
    });

    it('rejects when forbidden is not an array', () => {
      expect(isConstitutionFile({ ...valid, forbidden: 'nope' })).toBe(false);
    });

    it('rejects forbidden prefixes without a trailing slash', () => {
      expect(isConstitutionFile({ ...valid, forbiddenPrefixes: ['@scope'] })).toBe(false);
    });
  });

  describe('isHealthFile', () => {
    const valid = {
      version: STRUCTURE_SCHEMA_VERSION,
      generatedAt: '2026-06-25T00:00:00.000Z',
      workspace: '/tmp',
      aiSlopScore: 10,
      engineeringHygiene: 90,
      security: 100,
      repositoryHealth: 80,
      issueCounts: { high: 0, medium: 1, low: 2 },
    };

    it('rejects scores outside the schema range', () => {
      expect(isHealthFile({ ...valid, aiSlopScore: 101 })).toBe(false);
      expect(isHealthFile({ ...valid, issueCounts: { high: 1.2, medium: 0, low: 0 } })).toBe(false);
      expect(isHealthFile({ ...valid, generatedAt: 'not-a-date' })).toBe(false);
    });

    it('accepts optional score-basis provenance', () => {
      expect(isHealthFile({
        ...valid,
        scoreBasis: {
          denominator: 4,
          analyzedFiles: 4,
          issueSet: 'effective',
          suppressedIssueCount: 2,
          parseErrorCount: 1,
        },
      })).toBe(true);
      expect(isHealthFile({
        ...valid,
        scoreBasis: { denominator: -1, analyzedFiles: 0, issueSet: 'effective', suppressedIssueCount: 0, parseErrorCount: 0 },
      })).toBe(false);
    });

    it('accepts optional score-validity and completion accounting', () => {
      expect(isHealthFile({
        ...valid,
        completionStatus: 'partial',
        scoreValidity: 'incomplete',
        requested: 4,
        analyzed: 3,
        failed: 1,
        skipped: 0,
        scanAccounting: {
          selected: 4,
          analyzed: 3,
          zeroFinding: 3,
          incrementalCached: 0,
          parseFailed: 1,
          timedOut: 0,
          crashed: 0,
          internalFailed: 0,
        },
      })).toBe(true);
      expect(isHealthFile({ ...valid, scoreValidity: 'unknown' })).toBe(false);
      expect(isHealthFile({ ...valid, completionStatus: 'partial', scoreValidity: 'valid' })).toBe(false);
    });

    it('rejects non-conserving or contradictory optional scan accounting', () => {
      const withAccounting = {
        ...valid,
        completionStatus: 'partial',
        scoreValidity: 'incomplete',
        requested: 4,
        analyzed: 3,
        failed: 1,
        skipped: 0,
        scanAccounting: {
          selected: 4,
          analyzed: 3,
          zeroFinding: 3,
          incrementalCached: 0,
          parseFailed: 1,
          timedOut: 0,
          crashed: 0,
          internalFailed: 0,
        },
      };
      expect(isHealthFile(withAccounting)).toBe(true);
      expect(isHealthFile({
        ...withAccounting,
        scanAccounting: { ...withAccounting.scanAccounting, selected: 3 },
      })).toBe(false);
      expect(isHealthFile({
        ...withAccounting,
        scanAccounting: { ...withAccounting.scanAccounting, zeroFinding: 4 },
      })).toBe(false);
      expect(isHealthFile({ ...withAccounting, requested: 5 })).toBe(false);
      expect(isHealthFile({ ...withAccounting, analyzed: 2 })).toBe(false);
      expect(isHealthFile({ ...withAccounting, failed: 0 })).toBe(false);
      expect(isHealthFile({ ...withAccounting, skipped: 1 })).toBe(false);
    });
  });

  describe('isFileMtimeEntry', () => {
    it('accepts a valid entry', () => {
      expect(isFileMtimeEntry({ file: '/a.ts', mtimeMs: 123, hash: 'h' })).toBe(true);
    });

    it('rejects when mtimeMs is not a number', () => {
      expect(isFileMtimeEntry({ file: '/a.ts', mtimeMs: '123', hash: 'h' })).toBe(false);
    });
  });
});
