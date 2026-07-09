/**
 * v0.15.0 B.4: filesystem-backed `MemoryIO` for the engine.
 *
 * The engine's scoring and `parseSource` APIs are pure. This file is the
 * concrete filesystem implementation: `fsMemoryIO` wraps `node:fs/promises`
 * and is what the SlopBrick CLI passes in for memory persistence.
 *
 * `read` returns `null` on ENOENT or any other I/O error so the
 * engine can treat missing files as a normal "no data" condition
 * (rather than catching exceptions everywhere).
 *
 * `write` is the only operation that may throw — the engine never
 * expects it to be fallible.
 */

import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { MemoryIO } from '@usebrick/engine';

export const fsMemoryIO: MemoryIO = {
  read: (path: string) =>
    readFile(path, 'utf-8').catch(() => null),
  write: (path: string, content: string) =>
    mkdir(dirname(path), { recursive: true }).then(() =>
      writeFile(path, content, 'utf-8'),
    ),
  exists: (path: string) =>
    access(path).then(
      () => true,
      () => false,
    ),
};
