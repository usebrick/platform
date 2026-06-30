import type { ProjectReport } from '../types';

export function formatJson(report: ProjectReport): string {
  return JSON.stringify(report, null, 2);
}
