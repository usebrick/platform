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
});
