import { BadRequestException } from '@nestjs/common';
// These bounds already exist in the driver's background location path.
export const LOCATION_MAX_AGE_MS = 120_000;
export const LOCATION_MAX_FUTURE_MS = 10_000;
export function locationMeasurement(
  value: string | undefined,
  now = new Date(),
) {
  const measured = new Date(value ?? '');
  if (!Number.isFinite(measured.getTime()))
    throw new BadRequestException(
      'A valid GPS measurement time is required. Update the application.',
    );
  const age = now.getTime() - measured.getTime();
  if (age > LOCATION_MAX_AGE_MS || age < -LOCATION_MAX_FUTURE_MS)
    throw new BadRequestException(
      'GPS measurement is stale or device time is incorrect. Enable automatic date and time and request a fresh location.',
    );
  return measured;
}
