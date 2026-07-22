import policyData from './current-evidence-policy.json' with { type: 'json' };
import {
  createCurrentEvidencePolicyAccessors,
  type CurrentEvidencePolicyAccessors,
} from './current-evidence-policy.js';

const CURRENT_POLICY = createCurrentEvidencePolicyAccessors(policyData);

export function getCurrentEvidencePolicyAccessors(): CurrentEvidencePolicyAccessors {
  return CURRENT_POLICY;
}
