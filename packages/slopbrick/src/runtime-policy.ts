/**
 * Supported Node.js release lines for the published CLI.
 *
 * Keep this policy in one place so the doctor and tests cannot silently drift
 * from the package/workflow contract. We support maintained even-numbered
 * LTS lines only; the CI and packed-consumer matrix exercises both lines.
 */
export const SUPPORTED_NODE_MAJOR_VERSIONS = [22, 24] as const;

export type SupportedNodeMajorVersion = (typeof SUPPORTED_NODE_MAJOR_VERSIONS)[number];

export const NODE_ENGINE_RANGE = '^22.0.0 || ^24.0.0';
export const NODE_RUNTIME_LABEL = 'Node.js 22 or 24';

export function isSupportedNodeMajor(major: number): major is SupportedNodeMajorVersion {
  return (SUPPORTED_NODE_MAJOR_VERSIONS as readonly number[]).includes(major);
}
export function parseNodeMajor(version: string): number {
  const major = Number.parseInt(version.split('.')[0] ?? '', 10);
  return Number.isFinite(major) ? major : 0;
}
