import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const getCurrentEvidencePolicyAccessorsMock = vi.hoisted(() => vi.fn());

vi.mock('../../src/rules/current-evidence-policy-runtime', () => ({
  getCurrentEvidencePolicyAccessors: getCurrentEvidencePolicyAccessorsMock,
}));

import { createV103WorkerInvoker } from '../../src/calibration/v103/worker-invoker';
import { invokeV103Scanner } from '../../src/calibration/v103/scanner-adapter';
import { approvedCurrentPolicyFixture } from '../helpers/current-evidence-policy-v2';

const DEFAULT_OFF_RULE_ID = 'component/giant-component';
const GIANT_COMPONENT_SOURCE = `
export function Dashboard() {
  return (
    <>
      {a && <A />}
      {b && <B />}
      {c && <C />}
      {d && <D />}
      {e && <E />}
      {f && <F />}
      {g && <G />}
      {h && <H />}
    </>
  );
}
`;

describe('v10.3 worker invoker', () => {
  beforeEach(() => {
    getCurrentEvidencePolicyAccessorsMock.mockReset();
    getCurrentEvidencePolicyAccessorsMock.mockReturnValue(undefined);
  });

  it('forwards filters through the real worker environment and cleans result paths', async () => {
    let env: NodeJS.ProcessEnv | undefined;
    const invoker = createV103WorkerInvoker(async (input) => { env = input.env; await writeFile(input.resultPath, JSON.stringify({ ok: true, issues: [] })); return { exitCode: 0 }; });
    const result = await invokeV103Scanner(invoker, { filePath: '/private/file.ts', resultPath: '/ignored/result.json', timeoutMs: 10, includeRules: ['ai/a'], excludeRules: ['ai/b'] });
    expect(env?.SLOP_INCLUDE_RULES).toBe('["ai/a"]');
    expect(env?.SLOP_EXCLUDE_RULES).toBe('["ai/b"]');
    expect(env?.SLOP_AUDIT_CACHE).toBe('0');
    expect(result).toEqual({ kind: 'success', findingsCount: 0 });
  });

  it('preserves timeout classification and treats missing worker output as crash', async () => {
    const timeoutInvoker = createV103WorkerInvoker(async () => { const error = Object.assign(new Error('slow'), { code: 'ETIMEDOUT' }); throw error; });
    await expect(invokeV103Scanner(timeoutInvoker, { filePath: '/x', resultPath: '/y', timeoutMs: 10 })).resolves.toEqual({ kind: 'timeout' });
    const missingInvoker = createV103WorkerInvoker(async () => ({ exitCode: 0 }));
    await expect(invokeV103Scanner(missingInvoker, { filePath: '/x', resultPath: '/y', timeoutMs: 10 })).resolves.toEqual({ kind: 'crash' });
  });

  it('treats included rule IDs as invocation opt-ins while repository off and excludes still win', async () => {
    getCurrentEvidencePolicyAccessorsMock.mockReturnValue(approvedCurrentPolicyFixture());
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    const originalArgv = [...process.argv];
    const originalEnvironment = {
      SLOP_AUDIT_CACHE: process.env.SLOP_AUDIT_CACHE,
      SLOP_RESULT_PATH: process.env.SLOP_RESULT_PATH,
      SLOP_INCLUDE_RULES: process.env.SLOP_INCLUDE_RULES,
      SLOP_EXCLUDE_RULES: process.env.SLOP_EXCLUDE_RULES,
    };

    async function runWorkerSelection(options: { readonly repositoryOff?: boolean; readonly exclude?: boolean }) {
      const workspace = await mkdtemp(join(tmpdir(), 'slopbrick-v103-worker-selection-'));
      try {
        const filePath = join(workspace, 'Dashboard.tsx');
        const resultPath = join(workspace, 'result.json');
        await writeFile(filePath, GIANT_COMPONENT_SOURCE);
        if (options.repositoryOff) {
          await writeFile(
            join(workspace, 'slopbrick.config.mjs'),
            `export default { rules: { '${DEFAULT_OFF_RULE_ID}': 'off' } };\n`,
          );
        }
        process.argv[2] = filePath;
        process.env.SLOP_AUDIT_CACHE = '0';
        process.env.SLOP_RESULT_PATH = resultPath;
        process.env.SLOP_INCLUDE_RULES = JSON.stringify([DEFAULT_OFF_RULE_ID]);
        process.env.SLOP_EXCLUDE_RULES = JSON.stringify(options.exclude ? [DEFAULT_OFF_RULE_ID] : []);
        vi.resetModules();
        await import('../../src/calibration/v103/worker-process');
        let result = '';
        await vi.waitFor(async () => {
          result = await readFile(resultPath, 'utf8');
          expect(result.length).toBeGreaterThan(0);
        });
        return JSON.parse(result) as unknown;
      } finally {
        await rm(workspace, { recursive: true, force: true });
      }
    }

    try {
      await expect(runWorkerSelection({})).resolves.toMatchObject({
        ok: true,
        issues: [expect.objectContaining({ ruleId: DEFAULT_OFF_RULE_ID })],
      });
      await expect(runWorkerSelection({ repositoryOff: true })).resolves.toMatchObject({ ok: true, issues: [] });
      await expect(runWorkerSelection({ exclude: true })).resolves.toMatchObject({ ok: true, issues: [] });
    } finally {
      process.argv.splice(0, process.argv.length, ...originalArgv);
      for (const [name, value] of Object.entries(originalEnvironment)) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      }
      exit.mockRestore();
    }
  });
});
