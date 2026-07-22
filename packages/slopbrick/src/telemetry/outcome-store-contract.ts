export const OUTCOME_EVENT_EXPORT_VERSION_V1 = 'slopbrick-outcome-export-v1' as const;
export const OUTCOME_EVENT_STORE_MAX_BYTES_V1 = 1_048_576 as const;
export const OUTCOME_EVENT_STORE_MAX_EVENTS_V1 = 4_096 as const;
export const OUTCOME_EVENT_MAX_BYTES_V1 = 4_096 as const;

export class OutcomeEventStoreError extends Error {
  readonly lineNumber?: number;

  constructor(message: string, lineNumber?: number) {
    super(message);
    this.name = 'OutcomeEventStoreError';
    this.lineNumber = lineNumber;
  }
}
