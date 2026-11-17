import { ConflictException } from '@nestjs/common';
import {
  UNPAID_RESERVATION_DAYS,
  CONFIRMATION_HOURS_BEFORE_PICKUP,
  PAYMENT_DEADLINE_HOURS_BEFORE_PICKUP,
} from '../customer-requests/furniture-reservation-policy';
import {
  FREE_CANCELLATION_MS,
  DAY_MS,
  AFTER_GRACE_FEE_RATE,
  AFTER_DAY_FEE_RATE,
  cancellationFeeRate,
} from './booking-policy';

export const PAYMENT_POLICY_VERSION = 'delayed-cancellation-v2';
export const IMMEDIATE_PAYMENT_POLICY_VERSION = 'immediate-cancellation-v2';
export const BANK_APPROVAL_MS = 5 * 60 * 1000;
export const RENEWAL_LEAD_MS = 6 * 60 * 60 * 1000;
export const directChargesEnabled = () =>
  process.env.STRIPE_DIRECT_CHARGES_ENABLED === 'true';
export const delayedBookingsEnabled = () =>
  directChargesEnabled() ||
  process.env.DELAYED_BOOKING_AUTHORIZATION_ENABLED === 'true';

export function requirePaymentPolicy(
  version?: string,
  delayed = delayedBookingsEnabled(),
) {
  if (
    version !==
    (delayed ? PAYMENT_POLICY_VERSION : IMMEDIATE_PAYMENT_POLICY_VERSION)
  )
    throw new ConflictException(
      'Payment terms changed. Review the current payment rules and confirm again.',
    );
}

export function paymentPolicy(
  delayed = delayedBookingsEnabled(),
  existingVersion?: string | null,
) {
  const version =
    existingVersion ??
    (delayed ? PAYMENT_POLICY_VERSION : IMMEDIATE_PAYMENT_POLICY_VERSION);
  return {
    version,
    directCharges: directChargesEnabled(),
    booking: {
      authorization: delayed
        ? ('AFTER_COUNTDOWN' as const)
        : ('IMMEDIATE_CAPTURE' as const),
      freeCancellationSeconds: FREE_CANCELLATION_MS / 1000,
      bankApprovalSeconds: BANK_APPROVAL_MS / 1000,
      capture: delayed
        ? ('CUSTOMER_CONFIRMS_DELIVERY' as const)
        : ('ON_CONFIRMATION' as const),
      cancellationClock: version.endsWith('cancellation-v2')
        ? ('PICKUP_TIME' as const)
        : delayed
          ? ('COUNTDOWN_START' as const)
          : ('PAYMENT_CAPTURE' as const),
      cancellationTiers: version.endsWith('cancellation-v2')
        ? []
        : [
            {
              afterSeconds: FREE_CANCELLATION_MS / 1000,
              feeRate: AFTER_GRACE_FEE_RATE,
            },
            { afterSeconds: DAY_MS / 1000, feeRate: AFTER_DAY_FEE_RATE },
          ],
      cancellationBeforePickup: version.endsWith('cancellation-v2')
        ? [
            {
              minimumRemainingSeconds: (20 * DAY_MS) / 1000,
              refundRate: 0.85,
              driverRate: 0,
              platformRate: 0.15,
            },
            {
              minimumRemainingSeconds: (7 * DAY_MS) / 1000,
              refundRate: 0.75,
              driverRate: 0.1,
              platformRate: 0.15,
            },
            {
              moreThanRemainingSeconds: 48 * 60 * 60,
              refundRate: 0.65,
              driverRate: 0.2,
              platformRate: 0.15,
            },
            {
              minimumRemainingSeconds: 0,
              refundRate: 0.5,
              driverRate: 0.35,
              platformRate: 0.15,
            },
          ]
        : undefined,
      cancellationBeforeAssignment: 'FREE',
      cancellationAfterPickup: 'MANUAL_REVIEW',
      renewal: delayed ? 'REAUTHORIZE_BEFORE_EXPIRY' : 'NOT_APPLICABLE',
      driverConfirmation: delayed ? 'FUNDS_SECURED' : 'PAYMENT_CAPTURED',
    },
    reservation: {
      unpaidBeyondDays: UNPAID_RESERVATION_DAYS,
      confirmationHoursBeforePickup: CONFIRMATION_HOURS_BEFORE_PICKUP,
      deadlineHoursBeforePickup: PAYMENT_DEADLINE_HOURS_BEFORE_PICKUP,
    },
    topUp: {
      capture: 'IMMEDIATE',
      credit: 'CONFIRMED_SUCCESS',
      pendingCredit: false,
    },
    additionalExpense: {
      cardCapture: 'IMMEDIATE_ON_APPROVAL',
      cash: 'DUE_AT_DELIVERY',
    },
    cardSetup: { authorizesBookingAmount: false },
  };
}

export type PaymentPolicy = ReturnType<typeof paymentPolicy>;
export type ConfirmationFields = {
  policyVersion?: string | null;
  confirmationState?: string | null;
  confirmationStartedAt?: Date | null;
  authorizationDueAt?: Date | null;
  approvalDeadlineAt?: Date | null;
  authorizedAt?: Date | null;
  authorizationExpiresAt?: Date | null;
  failureReason?: string | null;
};

export function confirmationSummary(hold: ConfirmationFields) {
  if (!hold.confirmationStartedAt) return null;
  return {
    state: hold.confirmationState ?? 'CANCELLED',
    startedAt: hold.confirmationStartedAt.toISOString(),
    authorizationDueAt: hold.authorizationDueAt?.toISOString() ?? null,
    approvalDeadlineAt: hold.approvalDeadlineAt?.toISOString() ?? null,
    authorizedAt: hold.authorizedAt?.toISOString() ?? null,
    authorizationExpiresAt: hold.authorizationExpiresAt?.toISOString() ?? null,
    serverTime: new Date().toISOString(),
    failureReason: hold.failureReason ?? null,
    failureCode: !hold.failureReason
      ? null
      : /insufficient/i.test(hold.failureReason)
        ? 'INSUFFICIENT_FUNDS'
        : /deadline passed/i.test(hold.failureReason)
          ? 'PAYMENT_DEADLINE'
          : /selected offer|driver/i.test(hold.failureReason)
            ? 'OFFER_UNAVAILABLE'
            : /approval/i.test(hold.failureReason)
              ? 'APPROVAL_FAILED'
              : 'PAYMENT_FAILED',
    policy: paymentPolicy(true, hold.policyVersion),
  };
}

export function heldCancellationRate(
  hold: ConfirmationFields,
  assigned: boolean,
  now = Date.now(),
) {
  if (!assigned || !hold.authorizedAt || !hold.confirmationStartedAt) return 0;
  // New bookings switch to the paid tier at exactly ten minutes; legacy stays unchanged.
  if (now - hold.confirmationStartedAt.getTime() < FREE_CANCELLATION_MS)
    return 0;
  return cancellationFeeRate(
    hold.confirmationStartedAt,
    Math.max(
      now,
      hold.confirmationStartedAt.getTime() + FREE_CANCELLATION_MS + 1,
    ),
  );
}
