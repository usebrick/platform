import {
  deriveCorpusV1SourceDisposition,
  type CorpusV1SourceDisposition,
  type CorpusV1SourcePolicyInput,
} from './source-policy';

const SOURCE_POLICIES = {
  'humanvsai-code-dataset-mendeley-v1': {
    sourceId: 'humanvsai-code-dataset-mendeley-v1',
    authorityTier: 'publisher_attested',
    integrityStatus: 'verified',
    rightsDisposition: 'internal_analysis',
  },
  'formai-v1-gpt35-smoke-v1': {
    sourceId: 'formai-v1-gpt35-smoke-v1',
    authorityTier: 'repo_self_attested',
    integrityStatus: 'pending',
    rightsDisposition: 'internal_analysis',
  },
  'ossforge-humanvsaicode-hf-v1': {
    sourceId: 'ossforge-humanvsaicode-hf-v1',
    authorityTier: 'publisher_attested',
    integrityStatus: 'pending',
    rightsDisposition: 'reference_only',
  },
  'humaneval-gpt5-smoke-v1': {
    sourceId: 'humaneval-gpt5-smoke-v1',
    authorityTier: 'witnessed',
    integrityStatus: 'pending',
    rightsDisposition: 'reference_only',
  },
} as const satisfies Readonly<Record<string, CorpusV1SourcePolicyInput>>;

export function corpusV1SourceDisposition(sourceId: string): CorpusV1SourceDisposition {
  const policy = SOURCE_POLICIES[sourceId as keyof typeof SOURCE_POLICIES];
  if (policy === undefined) throw new Error(`Corpus v1 source is not registered: ${sourceId}`);
  return deriveCorpusV1SourceDisposition(policy);
}
