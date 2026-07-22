import { describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const getCurrentEvidencePolicyAccessorsMock = vi.hoisted(() => vi.fn());

vi.mock('../../src/rules/current-evidence-policy-runtime', () => ({
  getCurrentEvidencePolicyAccessors: getCurrentEvidencePolicyAccessorsMock,
}));

import { docsExitCode } from '../../src/cli/docs';
import { DEFAULT_CONFIG } from '../../src/config';
import { bindExplicitRuleOverrides } from '../../src/config/rule-override-provenance';
import { buildDocFreshness } from '../../src/engine/doc-freshness';
import { approvedCurrentPolicyFixture } from '../helpers/current-evidence-policy-v2';

describe('buildDocFreshness policy authority', () => {
  it('honors explicit off, current runnable authority, and independent score eligibility', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'slopbrick-doc-policy-'));
    try {
      writeFixture(dir);
      const config = bindExplicitRuleOverrides({
        ...DEFAULT_CONFIG,
        include: [],
        exclude: [],
        rules: {
          ...DEFAULT_CONFIG.rules,
          'docs/stale-package-reference': 'medium',
          'docs/stale-function-reference': 'medium',
          'docs/broken-link': 'off',
        },
      }, {
        'docs/broken-link': 'off',
      });

      getCurrentEvidencePolicyAccessorsMock.mockReturnValue(undefined);
      const legacy = await buildDocFreshness(dir, config);
      expect(legacy.byRule['docs/broken-link']).toBe(0);
      expect(legacy.byRule['docs/stale-package-reference']).toBeGreaterThan(0);
      expect(legacy.byRule['docs/stale-function-reference']).toBeGreaterThan(0);
      expect(legacy.docDrift).toBe('critical');

      const approved = approvedCurrentPolicyFixture();
      getCurrentEvidencePolicyAccessorsMock.mockReturnValue({
        ...approved,
        isRuleRunnable: (ruleId: string, configuredRules: Readonly<Record<string, string>>) => {
          if (configuredRules[ruleId] === 'off') return false;
          if (ruleId === 'docs/stale-function-reference') {
            return Object.hasOwn(configuredRules, ruleId);
          }
          return true;
        },
        isRuleScoreEligible: (ruleId: string) => (
          ruleId === 'docs/stale-package-reference'
            ? false
            : approved.isRuleScoreEligible(ruleId)
        ),
      });

      const current = await buildDocFreshness(dir, config);
      expect(current.byRule).toEqual({
        'docs/stale-package-reference': 25,
        'docs/stale-function-reference': 0,
        'docs/broken-link': 0,
      });
      expect(current.findings).toHaveLength(25);
      expect(current.findings.every(({ ruleId }) => (
        ruleId === 'docs/stale-package-reference'
      ))).toBe(true);
      expect(current.docFreshness).toBe(100);
      expect(current.docDrift).toBe('low');
      expect(docsExitCode({ result: current, scan: {} as never }, { strict: true })).toBe(0);
    } finally {
      getCurrentEvidencePolicyAccessorsMock.mockReset();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

function writeFixture(dir: string): void {
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'docs-policy-fixture' }));
  mkdirSync(join(dir, 'docs'), { recursive: true });
  const lines = ['# Policy authority fixture'];
  for (let index = 0; index < 25; index += 1) {
    lines.push(`Install with \`npm install stalepackage${index}\`.`);
    lines.push(`Call \`missingHelper${index}\`().`);
    lines.push(`[Missing guide ${index}](./docs/missing-${index}.md)`);
  }
  writeFileSync(join(dir, 'README.md'), `${lines.join('\n')}\n`, 'utf8');
}
