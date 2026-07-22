import { execFileSync, spawnSync } from 'node:child_process';
import {
  chmodSync,
  constants,
  existsSync,
  linkSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  appendOutcomeEventV1,
  deleteOutcomeEventsV1,
  exportOutcomeEventsV1,
  OUTCOME_EVENT_EXPORT_VERSION_V1,
  OUTCOME_EVENT_MAX_BYTES_V1,
  OUTCOME_EVENT_STORE_MAX_BYTES_V1,
  OUTCOME_EVENT_STORE_MAX_EVENTS_V1,
  OutcomeEventStoreError,
  readOutcomeEventsV1,
} from '../../src/telemetry/outcome-store';
import {
  OUTCOME_EVENT_VERSION_V1,
  type OutcomeEventV1,
} from '../../src/telemetry/outcome-event';

const supportsSecureOutcomeStore = process.platform !== 'win32' && constants.O_NOFOLLOW > 0;

describe.runIf(supportsSecureOutcomeStore)('privacy-safe local outcome event store', () => {
  let root: string;

  beforeEach(() => {
    root = realpathSync(mkdtempSync(join(tmpdir(), 'slopbrick-outcomes-')));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('round-trips validated events at an explicit path without touching flywheel history', () => {
    const storagePath = join(root, 'owner-selected', 'events-v1.jsonl');
    const event: OutcomeEventV1 = {
      version: OUTCOME_EVENT_VERSION_V1,
      event: 'first-finding-assessed',
      observedOn: '2026-07-22',
      producerVersion: '0.45.0',
      context: { framework: 'mixed', repositorySize: '101-500' },
      detectorId: 'logic/heaps-deviation',
      evidenceTier: 'quality-candidate-unmeasured',
      assessment: 'useful',
    };

    expect(readOutcomeEventsV1(storagePath)).toEqual([]);
    appendOutcomeEventV1(storagePath, event);

    expect(readOutcomeEventsV1(storagePath)).toEqual([event]);
    expect(readFileSync(storagePath, 'utf8')).toBe(`${JSON.stringify(event)}\n`);
    if (process.platform !== 'win32') {
      expect(statSync(storagePath).mode & 0o777).toBe(0o600);
      expect(statSync(dirname(storagePath)).mode & 0o777).toBe(0o700);
    }
    expect(existsSync(join(root, '.slopbrick', 'flywheel'))).toBe(false);
  });

  it('fails closed on corrupt storage without leaking or extending the corrupt line', () => {
    const storagePath = join(root, 'events-v1.jsonl');
    const secret = 'private-customer-source-text';
    const corruptBytes = `{"source":"${secret}"}\n`;
    writeFileSync(storagePath, corruptBytes, 'utf8');

    let readError: unknown;
    try {
      readOutcomeEventsV1(storagePath);
    } catch (error) {
      readError = error;
    }
    expect(readError).toBeInstanceOf(OutcomeEventStoreError);
    expect((readError as Error).message).not.toContain(secret);

    const validEvent: OutcomeEventV1 = {
      version: OUTCOME_EVENT_VERSION_V1,
      event: 'return-observed',
      observedOn: '2026-07-22',
      producerVersion: '0.45.0',
      context: { framework: 'mixed', repositorySize: '101-500' },
      window: 'within-7-days',
    };
    expect(() => appendOutcomeEventV1(storagePath, validEvent))
      .toThrow(OutcomeEventStoreError);
    expect(readFileSync(storagePath, 'utf8')).toBe(corruptBytes);
  });

  it('exports an inspectable versioned document and deletes only the selected ledger', () => {
    const storagePath = join(root, 'local', 'events-v1.jsonl');
    const exportPath = join(root, 'exports', 'outcomes.json');
    const event: OutcomeEventV1 = {
      version: OUTCOME_EVENT_VERSION_V1,
      event: 'action-decided',
      observedOn: '2026-07-22',
      producerVersion: '0.45.0',
      context: { framework: 'mixed', repositorySize: '101-500' },
      detectorId: 'logic/heaps-deviation',
      decision: 'declined',
      reason: 'no-safe-repair',
    };
    appendOutcomeEventV1(storagePath, event);

    expect(exportOutcomeEventsV1(storagePath, exportPath)).toBe(1);
    expect(JSON.parse(readFileSync(exportPath, 'utf8'))).toEqual({
      version: OUTCOME_EVENT_EXPORT_VERSION_V1,
      eventVersion: OUTCOME_EVENT_VERSION_V1,
      events: [event],
    });
    expect(readOutcomeEventsV1(storagePath)).toEqual([event]);
    if (process.platform !== 'win32') {
      expect(statSync(exportPath).mode & 0o777).toBe(0o600);
      expect(statSync(dirname(exportPath)).mode & 0o777).toBe(0o700);
    }

    expect(deleteOutcomeEventsV1(storagePath)).toBe(true);
    expect(deleteOutcomeEventsV1(storagePath)).toBe(false);
    expect(readOutcomeEventsV1(storagePath)).toEqual([]);
    expect(existsSync(exportPath)).toBe(true);
  });

  it('rejects serialization hooks and never echoes an unknown key that contains private text', () => {
    const storagePath = join(root, 'events-v1.jsonl');
    const secret = 'private-client-source-fragment';
    const hookedEvent: OutcomeEventV1 = {
      version: OUTCOME_EVENT_VERSION_V1,
      event: 'return-observed',
      observedOn: '2026-07-22',
      producerVersion: '0.45.0',
      context: { framework: 'mixed', repositorySize: '101-500' },
      window: 'within-7-days',
    };
    Object.defineProperty(hookedEvent, 'toJSON', {
      enumerable: false,
      value: () => ({ source: secret }),
    });

    expect(() => appendOutcomeEventV1(storagePath, hookedEvent))
      .toThrow(OutcomeEventStoreError);
    expect(existsSync(storagePath)).toBe(false);

    writeFileSync(storagePath, `${JSON.stringify({ [secret]: true })}\n`, 'utf8');
    let readError: unknown;
    try {
      readOutcomeEventsV1(storagePath);
    } catch (error) {
      readError = error;
    }
    expect(readError).toBeInstanceOf(OutcomeEventStoreError);
    expect((readError as Error).message).not.toContain(secret);
  });

  it('serializes a canonical snapshot instead of caller or prototype hooks', () => {
    const storagePath = join(root, 'events-v1.jsonl');
    const secret = 'private-proxy-source-fragment';
    const event: OutcomeEventV1 = {
      version: OUTCOME_EVENT_VERSION_V1,
      event: 'return-observed',
      observedOn: '2026-07-22',
      producerVersion: '0.45.0',
      context: { framework: 'mixed', repositorySize: '101-500' },
      window: 'within-7-days',
    };
    const proxy = new Proxy(event, {
      get(target, property, receiver) {
        if (property === 'toJSON') return () => ({ source: secret });
        return Reflect.get(target, property, receiver);
      },
    });

    appendOutcomeEventV1(storagePath, proxy);
    expect(readFileSync(storagePath, 'utf8')).not.toContain(secret);
    expect(readOutcomeEventsV1(storagePath)).toEqual([event]);

    const inheritedSecret = 'private-inherited-source-fragment';
    Object.defineProperty(Object.prototype, 'toJSON', {
      configurable: true,
      value: () => ({ source: inheritedSecret }),
    });
    try {
      appendOutcomeEventV1(storagePath, event);
    } finally {
      delete (Object.prototype as { toJSON?: unknown }).toJSON;
    }
    expect(readFileSync(storagePath, 'utf8')).not.toContain(inheritedSecret);
    expect(readOutcomeEventsV1(storagePath)).toEqual([event, event]);
  });

  it('rejects malformed JSONL, a busy store, and ledgers beyond the bounded size', () => {
    const storagePath = join(root, 'events-v1.jsonl');
    const event: OutcomeEventV1 = {
      version: OUTCOME_EVENT_VERSION_V1,
      event: 'return-observed',
      observedOn: '2026-07-22',
      producerVersion: '0.45.0',
      context: { framework: 'mixed', repositorySize: '101-500' },
      window: 'within-7-days',
    };
    writeFileSync(storagePath, `${JSON.stringify(event)}\n \n`, 'utf8');
    expect(() => readOutcomeEventsV1(storagePath)).toThrow(OutcomeEventStoreError);
    expect(() => appendOutcomeEventV1(storagePath, event)).toThrow(OutcomeEventStoreError);

    writeFileSync(storagePath, `${JSON.stringify(event)}\n`, 'utf8');
    writeFileSync(`${storagePath}.lock`, 'held\n', { mode: 0o600 });
    expect(() => readOutcomeEventsV1(storagePath)).toThrow(/busy/u);
    expect(() => appendOutcomeEventV1(storagePath, event)).toThrow(/busy/u);
    rmSync(`${storagePath}.lock`);

    writeFileSync(storagePath, 'x'.repeat(OUTCOME_EVENT_STORE_MAX_BYTES_V1 + 1), 'utf8');
    expect(() => readOutcomeEventsV1(storagePath)).toThrow(/size limit/u);
    expect(() => appendOutcomeEventV1(storagePath, event)).toThrow(/size limit/u);
  });

  it('writes canonical bytes for semantically identical event objects', () => {
    const firstStore = join(root, 'first', 'events-v1.jsonl');
    const secondStore = join(root, 'second', 'events-v1.jsonl');
    const firstExport = join(root, 'first', 'outcomes.json');
    const secondExport = join(root, 'second', 'outcomes.json');
    const first = {
      version: OUTCOME_EVENT_VERSION_V1,
      event: 'return-observed',
      observedOn: '2026-07-22',
      producerVersion: '0.45.0',
      context: { framework: 'mixed', repositorySize: '101-500' },
      window: 'within-7-days',
    } as const;
    const second = {
      window: 'within-7-days',
      context: { repositorySize: '101-500', framework: 'mixed' },
      producerVersion: '0.45.0',
      observedOn: '2026-07-22',
      event: 'return-observed',
      version: OUTCOME_EVENT_VERSION_V1,
    } as const;

    appendOutcomeEventV1(firstStore, first);
    appendOutcomeEventV1(secondStore, second);
    expect(readFileSync(firstStore, 'utf8')).toBe(readFileSync(secondStore, 'utf8'));
    exportOutcomeEventsV1(firstStore, firstExport);
    exportOutcomeEventsV1(secondStore, secondExport);
    expect(readFileSync(firstExport, 'utf8')).toBe(readFileSync(secondExport, 'utf8'));
  });

  it('ignores inherited array serialization hooks and rejects the active lock as an export path', () => {
    const storagePath = join(root, 'events-v1.jsonl');
    const exportPath = join(root, 'outcomes.json');
    const secret = 'private-array-source-fragment';
    const event: OutcomeEventV1 = {
      version: OUTCOME_EVENT_VERSION_V1,
      event: 'return-observed',
      observedOn: '2026-07-22',
      producerVersion: '0.45.0',
      context: { framework: 'mixed', repositorySize: '101-500' },
      window: 'within-7-days',
    };
    appendOutcomeEventV1(storagePath, event);

    Object.defineProperty(Array.prototype, 'toJSON', {
      configurable: true,
      value: () => [{ source: secret }],
    });
    try {
      exportOutcomeEventsV1(storagePath, exportPath);
    } finally {
      delete (Array.prototype as unknown as { toJSON?: unknown }).toJSON;
    }
    expect(readFileSync(exportPath, 'utf8')).not.toContain(secret);
    expect(JSON.parse(readFileSync(exportPath, 'utf8')).events).toEqual([event]);

    expect(() => exportOutcomeEventsV1(storagePath, `${storagePath}.lock`))
      .toThrow(OutcomeEventStoreError);
    expect(readOutcomeEventsV1(storagePath)).toEqual([event]);

    const mapSecret = 'private-array-map-source-fragment';
    const originalMap = Array.prototype.map;
    Object.defineProperty(Array.prototype, 'map', {
      configurable: true,
      value: () => [{ source: mapSecret }],
      writable: true,
    });
    try {
      exportOutcomeEventsV1(storagePath, exportPath);
    } finally {
      Object.defineProperty(Array.prototype, 'map', {
        configurable: true,
        value: originalMap,
        writable: true,
      });
    }
    expect(readFileSync(exportPath, 'utf8')).not.toContain(mapSecret);
    expect(JSON.parse(readFileSync(exportPath, 'utf8')).events).toEqual([event]);

    const iteratorSecret = 'private-array-iterator-source-fragment';
    const originalIterator = Array.prototype[Symbol.iterator];
    Object.defineProperty(Array.prototype, Symbol.iterator, {
      configurable: true,
      value: function* inheritedIterator(this: unknown[]) {
        const first = this[0];
        if (first !== null && typeof first === 'object' && 'event' in first) {
          yield { source: iteratorSecret };
          return;
        }
        yield* originalIterator.call(this);
      },
      writable: true,
    });
    try {
      exportOutcomeEventsV1(storagePath, exportPath);
    } finally {
      Object.defineProperty(Array.prototype, Symbol.iterator, {
        configurable: true,
        value: originalIterator,
        writable: true,
      });
    }
    expect(readFileSync(exportPath, 'utf8')).not.toContain(iteratorSecret);
    expect(JSON.parse(readFileSync(exportPath, 'utf8')).events).toEqual([event]);
  });

  it('does not let inherited numeric array setters substitute exported events', () => {
    const storagePath = join(root, 'events-v1.jsonl');
    const exportPath = join(root, 'outcomes.json');
    const secret = 'private-array-index-source-fragment';
    const event: OutcomeEventV1 = {
      version: OUTCOME_EVENT_VERSION_V1,
      event: 'return-observed',
      observedOn: '2026-07-22',
      producerVersion: '0.45.0',
      context: { framework: 'mixed', repositorySize: '101-500' },
      window: 'within-7-days',
    };
    appendOutcomeEventV1(storagePath, event);

    const inheritedIndex = Object.getOwnPropertyDescriptor(Array.prototype, '0');
    Object.defineProperty(Array.prototype, '0', {
      configurable: true,
      set(this: unknown[], value: unknown) {
        const replacement = value !== null && typeof value === 'object' && 'event' in value
          ? { source: secret }
          : value;
        Object.defineProperty(this, '0', {
          configurable: true,
          enumerable: true,
          value: replacement,
          writable: true,
        });
      },
    });
    try {
      exportOutcomeEventsV1(storagePath, exportPath);
    } finally {
      if (inheritedIndex === undefined) delete (Array.prototype as unknown as Record<string, unknown>)['0'];
      else Object.defineProperty(Array.prototype, '0', inheritedIndex);
    }

    expect(readFileSync(exportPath, 'utf8')).not.toContain(secret);
    expect(JSON.parse(readFileSync(exportPath, 'utf8')).events).toEqual([event]);
  });

  it('rejects a single whitespace-padded event above the per-event byte bound', () => {
    const storagePath = join(root, 'events-v1.jsonl');
    const event: OutcomeEventV1 = {
      version: OUTCOME_EVENT_VERSION_V1,
      event: 'return-observed',
      observedOn: '2026-07-22',
      producerVersion: '0.45.0',
      context: { framework: 'mixed', repositorySize: '101-500' },
      window: 'within-7-days',
    };
    const paddedLine = `${' '.repeat(OUTCOME_EVENT_MAX_BYTES_V1)}${JSON.stringify(event)}\n`;
    writeFileSync(storagePath, paddedLine, 'utf8');

    expect(() => readOutcomeEventsV1(storagePath)).toThrow(/event size limit/u);
    expect(() => appendOutcomeEventV1(storagePath, event)).toThrow(/event size limit/u);
  });

  it('enforces the final-newline and exact event-count boundaries without mutation', () => {
    const storagePath = join(root, 'events-v1.jsonl');
    const event: OutcomeEventV1 = {
      version: OUTCOME_EVENT_VERSION_V1,
      event: 'return-observed',
      observedOn: '2026-07-22',
      producerVersion: '0.45.0',
      context: { framework: 'mixed', repositorySize: '101-500' },
      window: 'within-7-days',
    };
    const line = JSON.stringify(event);
    writeFileSync(storagePath, line, 'utf8');
    expect(() => readOutcomeEventsV1(storagePath)).toThrow(/JSONL newline/u);
    expect(() => appendOutcomeEventV1(storagePath, event)).toThrow(/JSONL newline/u);
    expect(readFileSync(storagePath, 'utf8')).toBe(line);

    const exactLedger = `${new Array(OUTCOME_EVENT_STORE_MAX_EVENTS_V1).fill(line).join('\n')}\n`;
    expect(Buffer.byteLength(exactLedger)).toBeLessThan(OUTCOME_EVENT_STORE_MAX_BYTES_V1);
    writeFileSync(storagePath, exactLedger, 'utf8');
    expect(readOutcomeEventsV1(storagePath)).toHaveLength(OUTCOME_EVENT_STORE_MAX_EVENTS_V1);
    expect(() => appendOutcomeEventV1(storagePath, event)).toThrow(/event limit/u);
    expect(readFileSync(storagePath, 'utf8')).toBe(exactLedger);

    writeFileSync(storagePath, `${exactLedger}${line}\n`, 'utf8');
    expect(() => readOutcomeEventsV1(storagePath)).toThrow(/event limit/u);
  });

  it.runIf(process.platform !== 'win32')(
    'rejects FIFO lifecycle paths promptly before attempting blocking I/O',
    () => {
      const fifoPath = join(root, 'events-v1.fifo');
      const regularStore = join(root, 'regular', 'events-v1.jsonl');
      const regularExport = join(root, 'regular', 'outcomes.json');
      execFileSync('mkfifo', [fifoPath]);
      const script = [
        "import { appendOutcomeEventV1, deleteOutcomeEventsV1, exportOutcomeEventsV1, readOutcomeEventsV1 } from './src/telemetry/outcome-store.ts';",
        "import { OUTCOME_EVENT_VERSION_V1 } from './src/telemetry/outcome-event.ts';",
        "const event = { version: OUTCOME_EVENT_VERSION_V1, event: 'return-observed', observedOn: '2026-07-22', producerVersion: '0.45.0', context: { framework: 'mixed', repositorySize: '101-500' }, window: 'within-7-days' };",
        'let failures = 0;',
        'for (const operation of [',
        '  () => readOutcomeEventsV1(process.argv[1]),',
        '  () => appendOutcomeEventV1(process.argv[1], event),',
        '  () => exportOutcomeEventsV1(process.argv[1], process.argv[3]),',
        '  () => deleteOutcomeEventsV1(process.argv[1]),',
        ']) {',
        "  try { operation(); failures += 1; } catch (error) { if (error?.name !== 'OutcomeEventStoreError') failures += 1; }",
        '}',
        'appendOutcomeEventV1(process.argv[2], event);',
        "try { exportOutcomeEventsV1(process.argv[2], process.argv[1]); failures += 1; } catch (error) { if (error?.name !== 'OutcomeEventStoreError') failures += 1; }",
        'process.exitCode = failures === 0 ? 0 : 4;',
      ].join('\n');
      const child = spawnSync(
        process.execPath,
        [
          '--import', 'tsx', '--input-type=module', '-e', script,
          fifoPath, regularStore, regularExport,
        ],
        { cwd: process.cwd(), encoding: 'utf8', timeout: 1_000 },
      );

      expect(child.error).toBeUndefined();
      expect(child.status, child.stderr).toBe(0);
    },
  );

  it('rejects writes through an existing non-private direct parent', () => {
    const privateStore = join(root, 'private', 'events-v1.jsonl');
    const publicParent = join(root, 'shared');
    const publicStore = join(publicParent, 'events-v1.jsonl');
    const publicExport = join(publicParent, 'outcomes.json');
    const event: OutcomeEventV1 = {
      version: OUTCOME_EVENT_VERSION_V1,
      event: 'return-observed',
      observedOn: '2026-07-22',
      producerVersion: '0.45.0',
      context: { framework: 'mixed', repositorySize: '101-500' },
      window: 'within-7-days',
    };
    appendOutcomeEventV1(privateStore, event);
    mkdirSync(publicParent, { recursive: true });
    chmodSync(publicParent, 0o755);

    expect(() => appendOutcomeEventV1(publicStore, event)).toThrow(/owner-only/u);
    expect(() => exportOutcomeEventsV1(privateStore, publicExport)).toThrow(/owner-only/u);
    expect(existsSync(publicStore)).toBe(false);
    expect(existsSync(publicExport)).toBe(false);
  });

  it('rejects a filesystem-equivalent case alias before export can replace the ledger', () => {
    const caseProbe = join(root, 'case-probe');
    writeFileSync(caseProbe, 'probe\n', 'utf8');
    const caseInsensitive = existsSync(join(root, 'CASE-PROBE'));
    rmSync(caseProbe);
    if (!caseInsensitive) return;

    const storagePath = join(root, 'Events-v1.jsonl');
    const aliasExportPath = join(root, 'events-v1.jsonl');
    const event: OutcomeEventV1 = {
      version: OUTCOME_EVENT_VERSION_V1,
      event: 'return-observed',
      observedOn: '2026-07-22',
      producerVersion: '0.45.0',
      context: { framework: 'mixed', repositorySize: '101-500' },
      window: 'within-7-days',
    };
    appendOutcomeEventV1(storagePath, event);
    const ledgerBytes = readFileSync(storagePath, 'utf8');

    expect(() => exportOutcomeEventsV1(storagePath, aliasExportPath))
      .toThrow(OutcomeEventStoreError);
    expect(readFileSync(storagePath, 'utf8')).toBe(ledgerBytes);
    expect(readOutcomeEventsV1(storagePath)).toEqual([event]);
  });

  it.runIf(process.platform !== 'win32' && constants.O_NOFOLLOW > 0)(
    'refuses symlink paths and a hard-linked export alias without mutating targets',
    () => {
      const event: OutcomeEventV1 = {
        version: OUTCOME_EVENT_VERSION_V1,
        event: 'return-observed',
        observedOn: '2026-07-22',
        producerVersion: '0.45.0',
        context: { framework: 'mixed', repositorySize: '101-500' },
        window: 'within-7-days',
      };
      const storagePath = join(root, 'events-v1.jsonl');
      appendOutcomeEventV1(storagePath, event);
      const storageBytes = readFileSync(storagePath, 'utf8');

      const linkedStore = join(root, 'linked-events.jsonl');
      symlinkSync(storagePath, linkedStore);
      expect(() => readOutcomeEventsV1(linkedStore)).toThrow(OutcomeEventStoreError);
      expect(() => appendOutcomeEventV1(linkedStore, event)).toThrow(OutcomeEventStoreError);
      expect(readFileSync(storagePath, 'utf8')).toBe(storageBytes);

      const exportTarget = join(root, 'export-target.json');
      const exportTargetBytes = 'owner-controlled-export-target\n';
      writeFileSync(exportTarget, exportTargetBytes, 'utf8');
      const linkedExport = join(root, 'linked-export.json');
      symlinkSync(exportTarget, linkedExport);
      expect(() => exportOutcomeEventsV1(storagePath, linkedExport))
        .toThrow(OutcomeEventStoreError);
      expect(readFileSync(exportTarget, 'utf8')).toBe(exportTargetBytes);

      const hardLinkedExport = join(root, 'hard-linked-export.json');
      linkSync(storagePath, hardLinkedExport);
      expect(() => exportOutcomeEventsV1(storagePath, hardLinkedExport))
        .toThrow(OutcomeEventStoreError);
      expect(readFileSync(storagePath, 'utf8')).toBe(storageBytes);
      rmSync(hardLinkedExport);

      const hardLinkedStore = join(root, 'hard-linked-store.jsonl');
      linkSync(storagePath, hardLinkedStore);
      expect(() => appendOutcomeEventV1(hardLinkedStore, event))
        .toThrow(OutcomeEventStoreError);
      expect(() => deleteOutcomeEventsV1(hardLinkedStore))
        .toThrow(OutcomeEventStoreError);
      expect(readFileSync(storagePath, 'utf8')).toBe(storageBytes);
      rmSync(hardLinkedStore);

      const unrelatedTarget = join(root, 'unrelated-target.json');
      const unrelatedBytes = 'unrelated owner data\n';
      writeFileSync(unrelatedTarget, unrelatedBytes, 'utf8');
      const unrelatedHardLink = join(root, 'unrelated-hard-link.json');
      linkSync(unrelatedTarget, unrelatedHardLink);
      expect(() => exportOutcomeEventsV1(storagePath, unrelatedHardLink))
        .toThrow(OutcomeEventStoreError);
      expect(readFileSync(unrelatedTarget, 'utf8')).toBe(unrelatedBytes);

      const linkedDelete = join(root, 'linked-delete.jsonl');
      symlinkSync(storagePath, linkedDelete);
      expect(() => deleteOutcomeEventsV1(linkedDelete)).toThrow(OutcomeEventStoreError);
      expect(readFileSync(storagePath, 'utf8')).toBe(storageBytes);

      const realAncestor = join(root, 'real-ancestor');
      const linkedAncestor = join(root, 'linked-ancestor');
      // The target directory is created through a real path; the store API must
      // refuse the alias rather than following the ancestor link.
      const ancestorStore = join(realAncestor, 'events-v1.jsonl');
      const aliasStore = join(linkedAncestor, 'events-v1.jsonl');
      appendOutcomeEventV1(ancestorStore, event);
      symlinkSync(realAncestor, linkedAncestor, 'dir');
      expect(() => readOutcomeEventsV1(aliasStore)).toThrow(OutcomeEventStoreError);
      expect(() => appendOutcomeEventV1(aliasStore, event)).toThrow(OutcomeEventStoreError);
      expect(() => deleteOutcomeEventsV1(aliasStore)).toThrow(OutcomeEventStoreError);
    },
  );
});

describe.runIf(!supportsSecureOutcomeStore)('unsupported local outcome event store', () => {
  it('fails closed when POSIX no-follow filesystem semantics are unavailable', () => {
    const storagePath = join(tmpdir(), 'slopbrick-outcomes-unsupported.jsonl');
    expect(() => readOutcomeEventsV1(storagePath))
      .toThrow(/requires POSIX no-follow filesystem semantics/u);
  });
});
