export { createProvider, type ResearchProvider, type ProviderConfig, type GenerateOptions } from './provider';
export {
  generateSamples,
  extractCodeFromMarkdown,
  extForFramework,
  type GeneratedSample,
  type GenerateSamplesOptions,
} from './generator';
export {
  analyzeSample,
  analyzeSamples,
  type AnalysisResult,
  type BatchAnalysis,
} from './analyzer';
export {
  cluster,
  extractAndCluster,
  extractFromAnalysis,
  extractFromScan,
  type ExtractionResult,
  type Fingerprint,
  type FingerprintCluster,
} from './extractor';
export {
  clusterToCandidate,
  clustersToCandidates,
  type RuleCandidate,
} from './candidates';
export {
  calibrate,
  writeCalibrationReport,
  reportToMarkdown,
  type CalibrationReport,
  type RuleCalibration,
} from './calibrator';
