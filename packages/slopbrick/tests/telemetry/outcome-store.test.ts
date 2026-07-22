import {
  constants,
  existsSync,
  linkSync,
  mkdtempSync,
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
  OUTCOME_EVENT_STORE_MAX_BYTES_V1,
  OutcomeEventStoreError,
  readOutcomeEventsV1,
} from '../../src/telemetry/outcome-store';
import {
  OUTCOME_EVENT_VERSION_V1,
  type OutcomeEventV1,
} from '../../src/telemetry/outcome-event';

describe('privacy-safe local outcome event store', () => {
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

      const hardLinkedStore = join(root, 'hard-linked-store.jsonl');
      linkSync(storagePath, hardLinkedStore);
      expect(() => appendOutcomeEventV1(hardLinkedStore, event))
        .toThrow(OutcomeEventStoreError);
      expect(() => deleteOutcomeEventsV1(hardLinkedStore))
        .toThrow(OutcomeEventStoreError);
      expect(readFileSync(storagePath, 'utf8')).toBe(storageBytes);

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
