import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  assertCAL002MatrixApprovalV2,
  buildCAL002AppliedPolicyV2,
  type CAL002MatrixApprovalV2,
  type SlopbrickRuleEvidencePolicyV2,
} from '../../src/calibration/cal-002/application-v2';
import {
  assertCAL002FinalMatrixV2,
  type CAL002FinalMatrixV2,
} from '../../src/calibration/cal-002/matrix-v2';
import {
  createCurrentEvidencePolicyAccessors,
  type CurrentEvidencePolicyAccessors,
} from '../../src/rules/current-evidence-policy';

const HERE = dirname(fileURLToPath(import.meta.url));
const ARTIFACT_DIR = resolve(HERE, '../../../../docs/execution/evidence/artifacts/cal-002');
const TEST_IMPLEMENTATION_COMMIT_SHA = '1'.repeat(40);

function readArtifact(fileName: string): unknown {
  return JSON.parse(readFileSync(resolve(ARTIFACT_DIR, fileName), 'utf8')) as unknown;
}

function approvedInputs(): {
  readonly matrix: CAL002FinalMatrixV2;
  readonly approval: CAL002MatrixApprovalV2;
} {
  const matrix = readArtifact('final-matrix-v2.json');
  const approval = readArtifact('matrix-approval-v2.json');
  assertCAL002FinalMatrixV2(matrix);
  assertCAL002MatrixApprovalV2(approval);
  return { matrix, approval };
}

export function approvedCurrentPolicyArtifactFixture(): Extract<
  SlopbrickRuleEvidencePolicyV2,
  { readonly applied: true }
> {
  const { matrix, approval } = approvedInputs();
  return buildCAL002AppliedPolicyV2({
    matrix,
    approval,
    applicationImplementationCommitSha: TEST_IMPLEMENTATION_COMMIT_SHA,
  }).policy;
}

export function approvedCurrentPolicyFixture(): CurrentEvidencePolicyAccessors {
  return createCurrentEvidencePolicyAccessors(approvedCurrentPolicyArtifactFixture());
}
