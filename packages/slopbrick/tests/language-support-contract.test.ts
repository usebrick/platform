import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ALL_SOURCE_EXTENSIONS } from '../src/engine/discover';
import {
  LANGUAGE_SUPPORT,
  SCAN_FILE_TOOL_DESCRIPTION,
  supportedExtensions,
} from '../src/engine/language-support';

describe('language support contract', () => {
  it('derives every discoverable source extension from the reviewed manifest', () => {
    expect(Array.from(ALL_SOURCE_EXTENSIONS).sort()).toEqual(supportedExtensions());
  });

  it('keeps scan-file language wording neutral and points to the support contract', () => {
    expect(SCAN_FILE_TOOL_DESCRIPTION).toContain('supported source file');
    expect(SCAN_FILE_TOOL_DESCRIPTION).toContain('language support matrix');
    expect(SCAN_FILE_TOOL_DESCRIPTION).not.toContain('TypeScript/JavaScript');
  });

  it('declares parserless support explicitly for non-SWC language rows', () => {
    const parserless = LANGUAGE_SUPPORT
      .filter((entry) => entry.parserKind === 'source-preserving')
      .flatMap((entry) => entry.extensions);

    expect(parserless).toEqual(expect.arrayContaining(['.dart', '.rb', '.php', '.cs']));
  });

  it('publishes a static website summary generated from the manifest', () => {
    const websiteRoot = join(__dirname, '..', '..', 'website');
    const summaryPath = join(websiteRoot, 'src', 'data', 'language-support.json');
    expect(existsSync(summaryPath)).toBe(true);

    const summary = JSON.parse(readFileSync(summaryPath, 'utf8')) as {
      count: number;
      countLabel: string;
      names: string[];
    };
    const names = LANGUAGE_SUPPORT.map((entry) => entry.language);
    expect(summary).toEqual({
      count: names.length,
      countLabel: `${names.length} language families`,
      names,
    });

    const hero = readFileSync(join(websiteRoot, 'src', 'components', 'Hero.astro'), 'utf8');
    const trustStrip = readFileSync(join(websiteRoot, 'src', 'components', 'TrustStrip.astro'), 'utf8');
    for (const component of [hero, trustStrip]) {
      expect(component).toContain("../data/language-support.json");
      expect(component).not.toContain('9+');
      expect(component).not.toContain('TypeScript, Swift, Rust, Go, ...');
    }
  });
});
