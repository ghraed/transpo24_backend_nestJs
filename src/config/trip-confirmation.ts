/** Wider range only on the explicitly enabled local/test backend.
 * Never trust a client header or the phone's development-build flag.
 */
export function getTripConfirmationRadiusMeters(
  environment: NodeJS.ProcessEnv = process.env,
): number {
  return environment.NODE_ENV !== 'production' &&
    environment.ENABLE_TEST_ENDPOINTS === 'true'
    ? 2000
    : 100;
}
