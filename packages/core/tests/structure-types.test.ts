import { describe, it, expect } from 'vitest';
import {
  STRUCTURE_SCHEMA_VERSION,
  isStructurePattern,
  isComponentFingerprint,
  isInventoryFile,
  isConstitutionFile,
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
      fingerprint: 'abc',
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
