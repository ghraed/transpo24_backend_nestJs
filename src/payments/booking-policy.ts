// Both windows start when the booking payment is successfully captured.
export const FREE_CANCELLATION_MS = 10 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export function cancellationFeeRate(
  paidAt: Date | null | undefined,
  now = Date.now(),
): number {
  if (!paidAt) return 0;
  const elapsed = now - paidAt.getTime();
  if (elapsed <= FREE_CANCELLATION_MS) return 0;
  return elapsed <= DAY_MS ? 0.15 : 0.5;
}

export function driverDetailsAvailable(
  paidAt: Date | null | undefined,
  status: string,
  now = Date.now(),
): boolean {
  return (
    status !== 'CANCELLED' &&
    Boolean(paidAt && now - paidAt.getTime() > FREE_CANCELLATION_MS)
  );
}

// Tracking is independent of the delay for revealing contact details and chat.
export function driverTrackingAvailable(
  paidAt: Date | null | undefined,
  status: string,
): boolean {
  return (
    Boolean(paidAt) &&
    [
      'ACCEPTED',
      'DRIVER_ASSIGNED',
      'DRIVER_GOING_TO_PICKUP',
      'DRIVER_ARRIVED_PICKUP',
      'PICKUP_IN_PROGRESS',
      'ITEM_PICKED_UP',
      'IN_TRANSIT',
      'DRIVER_GOING_TO_DROPOFF',
      'DELIVERED',
      'COMPLETED',
    ].includes(status)
  );
}
