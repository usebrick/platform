import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  DEFAULT_CANDIDATE_BYTE_ROOTS,
  NODE_API_FLOOR,
  buildBootstrapDiagnostic,
  evaluateBuildTarget,
  evaluateNodeApiProbe,
  evaluateNodeVersion,
  evaluateVersion,
  assertNoCandidateBytePaths,
  assertNoNetworkClientSurface,
  runBootstrapProbes,
  type CommandRunner,
} from '../../scripts/cal/check-v103-admission-tools.mjs';

const scriptPath = fileURLToPath(new URL('../../scripts/cal/check-v103-admission-tools.mjs', import.meta.url));

function fakeRunner(responses: Readonly<Record<string, { readonly status: number | null; readonly stdout?: string; readonly stderr?: string }>>): CommandRunner {
  return (command, args) => {
    const key = [command, ...args].join(' ');
    const response = responses[key];
    if (response) return { status: response.status, stdout: response.stdout ?? '', stderr: response.stderr ?? '' };
    return { status: 127, stdout: '', stderr: `missing fake response: ${key}` };
  };
}

describe('v10.3 admission bootstrap probes', () => {
  it('rejects a missing or unsupported Node runtime before probing tools', () => {
    expect(evaluateNodeVersion(undefined)).toMatchObject({ ok: false, reason: 'missing-node' });
    expect(evaluateNodeVersion('v18.20.0')).toMatchObject({ ok: false, reason: 'node-api-floor' });
    expect(evaluateNodeVersion('v20.19.6')).toMatchObject({ ok: true, major: 20 });
    expect(NODE_API_FLOOR).toBe(20);
  });

  it('requires the exact behavior/version floors for Corepack, pnpm, Git, and Python/pyarrow', () => {
    expect(evaluateVersion('0.34.6', { major: 0, minor: 30, patch: 0 })).toMatchObject({ ok: true });
    expect(evaluateVersion('0.29.9', { major: 0, minor: 30, patch: 0 })).toMatchObject({ ok: false });
    expect(evaluateVersion('9.15.0', { major: 9, minor: 0, patch: 0 })).toMatchObject({ ok: true });
    expect(evaluateVersion('8.15.0', { major: 9, minor: 0, patch: 0 })).toMatchObject({ ok: false });
    expect(evaluateVersion('git version 2.50.1 (Apple Git-155)', { major: 2, minor: 30, patch: 0 })).toMatchObject({ ok: true });
    expect(evaluateVersion('Python 3.13.9', { major: 3, minor: 14, patch: 0 })).toMatchObject({ ok: false });

    const diagnostic = runBootstrapProbes({
      nodeVersion: 'v24.15.0',
      nodeApiProbe: 'ok',
      runner: fakeRunner({
        'corepack --version': { status: 0, stdout: '0.34.6\n' },
        'corepack pnpm --version': { status: 0, stdout: '9.15.0\n' },
        '/usr/bin/git --version': { status: 0, stdout: 'git version 2.50.1\n' },
        '/usr/bin/git -C /repo rev-parse --is-inside-work-tree': { status: 0, stdout: 'true\n' },
        '/python -B -c import sys, pyarrow; print(f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}"); print(pyarrow.__version__)': { status: 0, stdout: '3.14.4\n25.0.0\n' },
      }),
      corepackCommand: 'corepack',
      gitCommand: '/usr/bin/git',
      pythonCommand: '/python',
      repoRoot: '/repo',
      buildTargetSource: "export default { target: 'node18' };",
    });
    expect(diagnostic.ready).toBe(true);
    expect(diagnostic.checks.corepack.status).toBe('pass');
    expect(diagnostic.checks.pnpm.status).toBe('pass');
    expect(diagnostic.checks.git.status).toBe('pass');
    expect(diagnostic.checks.pythonPyarrow.status).toBe('pass');
  });

  it('reports each missing or wrong prerequisite as a failed check', () => {
    const diagnostic = runBootstrapProbes({
      nodeVersion: '',
      nodeApiProbe: 'missing',
      runner: fakeRunner({
        'corepack --version': { status: 0, stdout: '0.29.9\n' },
        'corepack pnpm --version': { status: 0, stdout: '8.15.0\n' },
        '/usr/bin/git --version': { status: 127, stderr: 'not found' },
        '/usr/bin/git -C /repo rev-parse --is-inside-work-tree': { status: 127, stderr: 'not found' },
        '/python -B -c import sys, pyarrow; print(f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}"); print(pyarrow.__version__)': { status: 0, stdout: '3.13.9\n24.0.0\n' },
      }),
      corepackCommand: 'corepack',
      gitCommand: '/usr/bin/git',
      pythonCommand: '/python',
      repoRoot: '/repo',
      buildTargetSource: "export default { target: 'node20' };",
    });
    expect(diagnostic.ready).toBe(false);
    for (const name of ['node', 'nodeApi', 'corepack', 'pnpm', 'git', 'gitReadOnlyBehavior', 'pythonPyarrow', 'buildTarget']) {
      expect(diagnostic.checks[name].status, name).toBe('fail');
    }
  });

  it('fails wrong build targets and failed Node API behavior probes', () => {
    expect(evaluateBuildTarget("export default { target: 'node20' };")).toMatchObject({ ok: false });
    expect(evaluateBuildTarget("export default { target: 'node18' };")).toMatchObject({ ok: true, target: 'node18' });
    expect(evaluateNodeApiProbe('missing')).toMatchObject({ ok: false });
    expect(evaluateNodeApiProbe('ok')).toMatchObject({ ok: true });
  });

  it('keeps BSD du, jq, and shasum diagnostic-only and out of authority inputs', () => {
    const diagnostic = buildBootstrapDiagnostic({
      checks: {
        du: { status: 'diagnostic', detail: 'available', authorityContribution: false },
        jq: { status: 'diagnostic', detail: 'available', authorityContribution: false },
        shasum: { status: 'diagnostic', detail: 'available', authorityContribution: false },
      },
    });
    expect(diagnostic.diagnosticOnly).toEqual(['du', 'jq', 'shasum']);
    expect(diagnostic.authorityEligible).toBe(false);
    expect(diagnostic).not.toHaveProperty('authorityHash');
    expect(diagnostic).not.toHaveProperty('authorityInputs');
    expect(diagnostic.checks.du.authorityContribution).toBe(false);
  });

  it('rejects candidate-byte paths without reading them', () => {
    expect(DEFAULT_CANDIDATE_BYTE_ROOTS).toEqual([]);
    expect(() => assertNoCandidateBytePaths(['/Users/cheng/corpus-expansion/v10.3/sources/benchmarks/a.ts'])).toThrow(/candidate-byte/i);
    expect(() => assertNoCandidateBytePaths(['/tmp/candidate-bytes/a.ts'], ['/tmp/candidate-bytes'])).toThrow(/candidate-byte/i);
  });

  it('contains no network client surface and exposes an explicitly offline diagnostic', () => {
    const source = readFileSync(scriptPath, 'utf8');
    expect(() => assertNoNetworkClientSurface(source)).not.toThrow();
    expect(source).not.toContain('/Users/cheng');
    expect(source).not.toContain('corpus-expansion');
    const diagnostic = runBootstrapProbes({
      nodeVersion: 'v24.15.0',
      nodeApiProbe: 'ok',
      runner: fakeRunner({}),
      buildTargetSource: "export default { target: 'node18' };",
    });
    expect(diagnostic.network.policy).toBe('denied');
    expect(diagnostic.network.clientSurface).toBe('none');
    expect(diagnostic.candidateBytes.accessed).toBe(false);
  });
});
