type ConfirmationHealthRow = {
  confirmationState: string | null;
  authorizationDueAt: Date | null;
  approvalDeadlineAt: Date | null;
  authorizationExpiresAt: Date | null;
  previousStripePaymentIntentId: string | null;
  operationKind: string | null;
  updatedAt: Date;
};

export function bookingConfirmationHealth(
  rows: ConfirmationHealthRow[],
  now = Date.now(),
) {
  const counts = {
    overdueConfirmations: 0,
    overdueApprovals: 0,
    unreleasedHolds: 0,
    unsettledCaptures: 0,
    expiredAuthorizations: 0,
  };
  const overdue = (date: Date | null) =>
    Boolean(date && date.getTime() < now - 60000);
  for (const row of rows) {
    if (
      (row.confirmationState === 'GRACE_PERIOD' &&
        overdue(row.authorizationDueAt)) ||
      (row.confirmationState === 'AUTHORIZING' && overdue(row.updatedAt))
    )
      counts.overdueConfirmations++;
    if (
      row.confirmationState === 'ACTION_REQUIRED' &&
      overdue(row.approvalDeadlineAt)
    )
      counts.overdueApprovals++;
    if (
      (row.previousStripePaymentIntentId || row.operationKind === 'CANCEL') &&
      overdue(row.updatedAt)
    )
      counts.unreleasedHolds++;
    if (row.operationKind === 'DELIVERY' && overdue(row.updatedAt))
      counts.unsettledCaptures++;
    if (
      row.confirmationState === 'CONFIRMED' &&
      row.authorizationExpiresAt &&
      row.authorizationExpiresAt.getTime() <= now
    )
      counts.expiredAuthorizations++;
  }
  return counts;
}
