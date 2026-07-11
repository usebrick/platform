import { CliUsageError } from '../exit-codes.js';

export const OUTPUT_FORMATS = ['pretty', 'json', 'sarif', 'html'] as const;

const OUTPUT_FORMAT_SET: ReadonlySet<string> = new Set(OUTPUT_FORMATS);

export function validateOutputFormat(format: string | undefined): void {
  if (format !== undefined && !OUTPUT_FORMAT_SET.has(format)) {
    throw new CliUsageError(
      `Unknown --format value: ${format}. Valid: ${OUTPUT_FORMATS.join(', ')}.`,
    );
  }
}
