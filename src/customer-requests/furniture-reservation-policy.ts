export const HOUR = 60 * 60 * 1000;
export const UNPAID_RESERVATION_DAYS = 5;
export const CONFIRMATION_HOURS_BEFORE_PICKUP = 48;
export const PAYMENT_DEADLINE_HOURS_BEFORE_PICKUP = 24;
export function bookingDay(date: Date, timeZone = 'UTC'): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const n = (type: string) => Number(parts.find((p) => p.type === type)!.value);
  return Date.UTC(n('year'), n('month') - 1, n('day'));
}
export function shouldDeferTransportPayment(
  serviceKey: string,
  pickup: Date | null,
  timeZone: string | null,
  now = new Date(),
) {
  return (
    serviceKey === 'FURNITURE_TRANSPORT' &&
    !!pickup &&
    bookingDay(pickup, timeZone ?? 'UTC') >
      bookingDay(now, timeZone ?? 'UTC') + UNPAID_RESERVATION_DAYS * 24 * HOUR
  );
}
export function confirmationWindow(pickup: Date) {
  return {
    confirmationOpensAt: new Date(
      pickup.getTime() - CONFIRMATION_HOURS_BEFORE_PICKUP * HOUR,
    ),
    paymentDeadlineAt: new Date(
      pickup.getTime() - PAYMENT_DEADLINE_HOURS_BEFORE_PICKUP * HOUR,
    ),
  };
}
export type ReservationSummary = {
  state: string;
  confirmationOpensAt: string;
  paymentDeadlineAt: string;
  pickupConfirmedAt: string | null;
  paidAt: string | null;
  canConfirmAndPay: boolean;
  canCancel: boolean;
};
export function reservationSummary(
  request: {
    deferredPaymentState?: string | null;
    paymentHold?: { confirmationStartedAt?: Date | null } | null;
    confirmationOpensAt?: Date | null;
    paymentDeadlineAt?: Date | null;
    pickupConfirmedAt?: Date | null;
    reservationPaidAt?: Date | null;
    status: string;
  },
  now = new Date(),
): ReservationSummary | null {
  if (
    !request.deferredPaymentState ||
    !request.confirmationOpensAt ||
    !request.paymentDeadlineAt
  )
    return null;
  return {
    state: request.deferredPaymentState,
    confirmationOpensAt: request.confirmationOpensAt.toISOString(),
    paymentDeadlineAt: request.paymentDeadlineAt.toISOString(),
    pickupConfirmedAt: request.pickupConfirmedAt?.toISOString() ?? null,
    paidAt: request.reservationPaidAt?.toISOString() ?? null,
    canConfirmAndPay:
      request.status === 'RESERVED' &&
      !request.paymentHold?.confirmationStartedAt &&
      now >= request.confirmationOpensAt &&
      now < request.paymentDeadlineAt,
    canCancel: request.status === 'RESERVED',
  };
}
