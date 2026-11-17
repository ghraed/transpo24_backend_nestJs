import { Prisma } from '@prisma/client';

// Both windows start when the booking payment is successfully captured.
export const FREE_CANCELLATION_MS = 10 * 60 * 1000;
export const AFTER_GRACE_FEE_RATE = 0.15;
export const AFTER_DAY_FEE_RATE = 0.5;
export const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

export function isFreeCancellationWindow(
  startedAt: Date | null | undefined,
  authorizedAt: Date | null | undefined,
  now = Date.now(),
) {
  if (!startedAt || now - startedAt.getTime() > FREE_CANCELLATION_MS)
    return false;
  return (
    !authorizedAt ||
    authorizedAt.getTime() >= startedAt.getTime() + FREE_CANCELLATION_MS
  );
}

/** Shares of the transport price when the customer cancels before pickup. */
export function customerCancellationShares(
  pickupAt: Date | null | undefined,
  isImmediate: boolean,
  now = Date.now(),
  free = false,
) {
  if (free) return { refund: 1, driver: 0, platform: 0 };
  const remaining = isImmediate || !pickupAt ? 0 : pickupAt.getTime() - now;
  if (remaining >= 20 * DAY_MS)
    return { refund: 0.85, driver: 0, platform: 0.15 };
  if (remaining >= 7 * DAY_MS)
    return { refund: 0.75, driver: 0.1, platform: 0.15 };
  if (remaining > 48 * HOUR_MS)
    return { refund: 0.65, driver: 0.2, platform: 0.15 };
  return { refund: 0.5, driver: 0.35, platform: 0.15 };
}

export function customerCancellationAmounts(
  total: Prisma.Decimal,
  serviceFee: Prisma.Decimal | null | undefined,
  pickupAt: Date | null | undefined,
  isImmediate: boolean,
  now = Date.now(),
  free = false,
) {
  const fee = serviceFee ?? new Prisma.Decimal(0);
  const base = total.sub(fee);
  const shares = customerCancellationShares(pickupAt, isImmediate, now, free);
  const refund = base.mul(shares.refund).toDecimalPlaces(2).add(fee);
  const platform = base.mul(shares.platform).toDecimalPlaces(2);
  const retained = total.sub(refund);
  const driver = retained.sub(platform);
  return { refund, driver, platform, retained };
}

export function cancellationFeeRate(
  paidAt: Date | null | undefined,
  now = Date.now(),
): number {
  if (!paidAt) return 0;
  const elapsed = now - paidAt.getTime();
  if (elapsed <= FREE_CANCELLATION_MS) return 0;
  return elapsed <= DAY_MS ? AFTER_GRACE_FEE_RATE : AFTER_DAY_FEE_RATE;
}

export function driverDetailsAvailable(
  paidAt: Date | null | undefined,
  status: string,
  now = Date.now(),
  authorizedAt?: Date | null,
): boolean {
  return (
    status !== 'CANCELLED' &&
    Boolean(
      authorizedAt || (paidAt && now - paidAt.getTime() > FREE_CANCELLATION_MS),
    )
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
