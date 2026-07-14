import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  isSupportedNodeMajor,
  NODE_ENGINE_RANGE,
  NODE_RUNTIME_LABEL,
  parseNodeMajor,
  SUPPORTED_NODE_MAJOR_VERSIONS,
} from '../src/runtime-policy.js';

const packageJson = (relativePath: string): { engines?: { node?: string } } =>
  JSON.parse(readFileSync(join(__dirname, '..', '..', '..', relativePath), 'utf8')) as {
    engines?: { node?: string };
  };

describe('Node runtime policy', () => {
  it('declares the two supported even-numbered LTS lines', () => {
    expect(SUPPORTED_NODE_MAJOR_VERSIONS).toEqual([22, 24]);
    expect(NODE_ENGINE_RANGE).toBe('^22.0.0 || ^24.0.0');
    expect(NODE_RUNTIME_LABEL).toBe('Node.js 22 or 24');
    expect(isSupportedNodeMajor(22)).toBe(true);
    expect(isSupportedNodeMajor(24)).toBe(true);
    expect(isSupportedNodeMajor(20)).toBe(false);
    expect(isSupportedNodeMajor(23)).toBe(false);
  });

  it('parses runtime majors without accepting malformed versions', () => {
    expect(parseNodeMajor('24.15.0')).toBe(24);
    expect(parseNodeMajor('22.22.3')).toBe(22);
    expect(parseNodeMajor('not-a-version')).toBe(0);
  });

  it('keeps workspace packages on the supported even-major policy', () => {
    for (const relativePath of [
      'package.json',
      'packages/core/package.json',
      'packages/engine/package.json',
      'packages/slopbrick/package.json',
    ]) {
      expect(packageJson(relativePath).engines?.node, relativePath).toBe(NODE_ENGINE_RANGE);
    }
    // Astro 6/7 and Vite 8 require Node >=22.12. Keep the private website on
    // the same even-major lines while advertising that framework floor.
    expect(packageJson('packages/website/package.json').engines?.node)
      .toBe('^22.12.0 || ^24.0.0');
  });
});
