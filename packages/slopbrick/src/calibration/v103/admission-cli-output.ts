/**
 * Serialize a publication failure for the offline admission CLI.
 *
 * Publication result objects carry the recovery nonce and transaction paths
 * required by an operator. Keep the result spread in one small, tested
 * boundary so individual command handlers cannot accidentally omit those
 * recovery selectors when adding a new error code.
 */
export function admissionPublicationFailureJson(
  command: string,
  code: string,
  result: object,
  message?: string,
): string {
  return JSON.stringify({
    ok: false,
    command,
    code,
    ...result,
    ...(message === undefined ? {} : { errors: [message] }),
  });
}
