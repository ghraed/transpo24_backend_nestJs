import { bookingConfirmationHealth } from './booking-confirmation-health';

it('reports overdue confirmations, approvals, unreleased holds, capture failures and expired authorizations', () => {
  const now = Date.now();
  const old = new Date(now - 60001);
  const base = {
    confirmationState: null,
    authorizationDueAt: null,
    approvalDeadlineAt: null,
    authorizationExpiresAt: null,
    previousStripePaymentIntentId: null,
    operationKind: null,
    updatedAt: old,
  };
  expect(
    bookingConfirmationHealth(
      [
        { ...base, confirmationState: 'GRACE_PERIOD', authorizationDueAt: old },
        { ...base, confirmationState: 'AUTHORIZING' },
        {
          ...base,
          confirmationState: 'ACTION_REQUIRED',
          approvalDeadlineAt: old,
        },
        { ...base, previousStripePaymentIntentId: 'old-intent' },
        { ...base, operationKind: 'CANCEL' },
        { ...base, operationKind: 'DELIVERY' },
        {
          ...base,
          confirmationState: 'CONFIRMED',
          authorizationExpiresAt: new Date(now),
        },
        {
          ...base,
          confirmationState: 'GRACE_PERIOD',
          authorizationDueAt: new Date(now + 60000),
        },
      ],
      now,
    ),
  ).toEqual({
    overdueConfirmations: 2,
    overdueApprovals: 1,
    unreleasedHolds: 2,
    unsettledCaptures: 1,
    expiredAuthorizations: 1,
  });
});
