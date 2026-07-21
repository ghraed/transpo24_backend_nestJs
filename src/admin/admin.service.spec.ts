jest.mock('../notifications/notifications.service', () => ({
  NotificationsService: class NotificationsServiceMock {},
}));

import {
  CustomerWalletTopUpStatus,
  DriverPayoutState,
  Prisma,
  TripPaymentSettlementStatus,
} from '@prisma/client';

import { AdminService } from './admin.service';

describe('AdminService', () => {
  it('merges trip and wallet dispute records into the admin disputes response', async () => {
    const prisma = {
      tripPaymentSettlement: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'settlement-1',
            requestId: 'trip-1',
            status: TripPaymentSettlementStatus.DISPUTED,
            currency: 'CHF',
            collectedAmount: new Prisma.Decimal('18.50'),
            requiresManualReview: true,
            stripeDisputeId: 'dp_trip_1',
            disputeStatus: 'needs_response',
            disputeReason: 'fraudulent',
            disputeAmount: new Prisma.Decimal('18.50'),
            disputeCurrency: 'CHF',
            disputeCreatedAt: new Date('2026-07-20T09:00:00.000Z'),
            disputeUpdatedAt: new Date('2026-07-20T09:30:00.000Z'),
            disputeClosedAt: null,
            disputeEvidenceDueBy: new Date('2026-07-21T09:00:00.000Z'),
            createdAt: new Date('2026-07-20T08:00:00.000Z'),
            updatedAt: new Date('2026-07-20T09:30:00.000Z'),
            driverPayoutState: DriverPayoutState.EARNING_CREATED,
            paymentHold: {
              stripeChargeId: 'ch_trip_1',
              stripePaymentIntentId: 'pi_trip_1',
            },
            customer: {
              id: 'customer-1',
              name: 'Trip Customer',
              email: 'trip@example.com',
            },
            driver: {
              id: 'driver-1',
              userId: 'driver-user-1',
              user: {
                name: 'Trip Driver',
                email: 'driver@example.com',
              },
            },
          },
        ]),
      },
      customerWalletTopUp: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'topup-1',
            status: CustomerWalletTopUpStatus.MANUAL_REVIEW,
            amount: new Prisma.Decimal('25.00'),
            currency: 'CHF',
            requiresManualReview: true,
            stripeDisputeId: 'dp_topup_1',
            stripePaymentIntentId: 'pi_topup_1',
            stripeChargeId: 'ch_topup_1',
            disputeStatus: 'lost',
            disputeReason: 'product_not_received',
            disputeAmount: new Prisma.Decimal('25.00'),
            disputeCurrency: 'CHF',
            disputeCreatedAt: new Date('2026-07-20T07:00:00.000Z'),
            disputeUpdatedAt: new Date('2026-07-20T08:00:00.000Z'),
            disputeClosedAt: new Date('2026-07-20T08:30:00.000Z'),
            disputeEvidenceDueBy: null,
            createdAt: new Date('2026-07-20T06:00:00.000Z'),
            updatedAt: new Date('2026-07-20T08:30:00.000Z'),
            customer: {
              id: 'customer-2',
              name: 'Wallet Customer',
              email: 'wallet@example.com',
            },
          },
        ]),
      },
    };
    const service = new AdminService(
      prisma as never,
      {} as never,
      {} as never,
    );

    const result = await service.findPaymentDisputes({
      page: 1,
      limit: 20,
      view: 'open',
    });

    expect(prisma.tripPaymentSettlement.findMany).toHaveBeenCalled();
    expect(prisma.customerWalletTopUp.findMany).toHaveBeenCalled();
    expect(result.total).toBe(2);
    expect(result.summary).toEqual({
      openCount: 1,
      closedCount: 1,
      manualReviewCount: 2,
    });
    expect(result.items[0]).toEqual({
      id: 'settlement-1',
      recordType: 'TRIP_CHARGE',
      paymentStatus: TripPaymentSettlementStatus.DISPUTED,
      disputeStatus: 'needs_response',
      stripeDisputeId: 'dp_trip_1',
      stripeChargeId: 'ch_trip_1',
      stripePaymentIntentId: 'pi_trip_1',
      amount: 18.5,
      currency: 'CHF',
      disputeAmount: 18.5,
      disputeCurrency: 'CHF',
      disputeReason: 'fraudulent',
      disputeCreatedAt: '2026-07-20T09:00:00.000Z',
      disputeUpdatedAt: '2026-07-20T09:30:00.000Z',
      disputeClosedAt: null,
      disputeEvidenceDueBy: '2026-07-21T09:00:00.000Z',
      requiresManualReview: true,
      customer: {
        id: 'customer-1',
        name: 'Trip Customer',
        email: 'trip@example.com',
      },
      trip: {
        requestId: 'trip-1',
        driver: {
          id: 'driver-1',
          userId: 'driver-user-1',
          name: 'Trip Driver',
          email: 'driver@example.com',
        },
        driverPayoutState: DriverPayoutState.EARNING_CREATED,
      },
      walletTopUpId: null,
      createdAt: '2026-07-20T08:00:00.000Z',
      updatedAt: '2026-07-20T09:30:00.000Z',
    });
    expect(result.items[1]).toEqual({
      id: 'topup-1',
      recordType: 'WALLET_TOP_UP',
      paymentStatus: CustomerWalletTopUpStatus.MANUAL_REVIEW,
      disputeStatus: 'lost',
      stripeDisputeId: 'dp_topup_1',
      stripeChargeId: 'ch_topup_1',
      stripePaymentIntentId: 'pi_topup_1',
      amount: 25,
      currency: 'CHF',
      disputeAmount: 25,
      disputeCurrency: 'CHF',
      disputeReason: 'product_not_received',
      disputeCreatedAt: '2026-07-20T07:00:00.000Z',
      disputeUpdatedAt: '2026-07-20T08:00:00.000Z',
      disputeClosedAt: '2026-07-20T08:30:00.000Z',
      disputeEvidenceDueBy: null,
      requiresManualReview: true,
      customer: {
        id: 'customer-2',
        name: 'Wallet Customer',
        email: 'wallet@example.com',
      },
      trip: null,
      walletTopUpId: 'topup-1',
      createdAt: '2026-07-20T06:00:00.000Z',
      updatedAt: '2026-07-20T08:30:00.000Z',
    });
  });

  it('runs wallet reconciliation jobs and persists a partial run for missing wallet transactions', async () => {
    const runningRun = {
      id: 'run-wallet-1',
      stream: 'WALLET',
      status: 'RUNNING',
      scannedCount: 0,
      matchedCount: 0,
      mismatchCount: 0,
      missingCount: 0,
      errorMessage: null,
      startedAt: new Date('2026-07-21T09:00:00.000Z'),
      finishedAt: null,
      createdAt: new Date('2026-07-21T09:00:00.000Z'),
      updatedAt: new Date('2026-07-21T09:00:00.000Z'),
    };
    const completedRun = {
      ...runningRun,
      status: 'PARTIAL',
      scannedCount: 1,
      matchedCount: 0,
      mismatchCount: 0,
      missingCount: 1,
      finishedAt: new Date('2026-07-21T09:00:05.000Z'),
      updatedAt: new Date('2026-07-21T09:00:05.000Z'),
    };

    const prisma = {
      customerWalletTopUp: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'topup-1',
            walletId: 'wallet-1',
            customerId: 'customer-1',
            amount: new Prisma.Decimal('40.00'),
            currency: 'CHF',
            status: CustomerWalletTopUpStatus.SUCCEEDED,
            stripePaymentIntentId: 'pi_topup_1',
            stripeChargeId: 'ch_topup_1',
            requiresManualReview: false,
            failureReason: null,
            createdAt: new Date('2026-07-21T08:00:00.000Z'),
            updatedAt: new Date('2026-07-21T08:15:00.000Z'),
            customer: {
              id: 'customer-1',
              name: 'Wallet Customer',
              email: 'wallet@example.com',
            },
            walletTransactions: [],
          },
        ]),
      },
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([runningRun])
        .mockResolvedValueOnce([completedRun]),
      $executeRaw: jest.fn().mockResolvedValue(1),
      $transaction: jest.fn().mockImplementation(async (operations) => {
        return Promise.all(operations);
      }),
    };
    const service = new AdminService(
      prisma as never,
      {} as never,
      {} as never,
    );

    const result = await service.runPaymentReconciliation({
      stream: 'wallet',
    });

    expect(prisma.customerWalletTopUp.findMany).toHaveBeenCalled();
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
    expect(result.runs).toEqual([
      {
        id: 'run-wallet-1',
        stream: 'wallet',
        status: 'PARTIAL',
        startedAt: '2026-07-21T09:00:00.000Z',
        finishedAt: '2026-07-21T09:00:05.000Z',
        scannedCount: 1,
        matchedCount: 0,
        mismatchCount: 0,
        missingCount: 1,
        errorMessage: null,
      },
    ]);
  });

  it('lists reconciliation records from the latest runs', async () => {
    const prisma = {
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([
          {
            id: 'run-wallet-1',
            stream: 'WALLET',
            status: 'SUCCESS',
            scannedCount: 2,
            matchedCount: 2,
            mismatchCount: 0,
            missingCount: 0,
            errorMessage: null,
            startedAt: new Date('2026-07-21T09:00:00.000Z'),
            finishedAt: new Date('2026-07-21T09:00:03.000Z'),
            createdAt: new Date('2026-07-21T09:00:00.000Z'),
            updatedAt: new Date('2026-07-21T09:00:03.000Z'),
          },
          {
            id: 'run-capture-1',
            stream: 'CAPTURE',
            status: 'PARTIAL',
            scannedCount: 3,
            matchedCount: 2,
            mismatchCount: 1,
            missingCount: 0,
            errorMessage: null,
            startedAt: new Date('2026-07-21T09:01:00.000Z'),
            finishedAt: new Date('2026-07-21T09:01:04.000Z'),
            createdAt: new Date('2026-07-21T09:01:00.000Z'),
            updatedAt: new Date('2026-07-21T09:01:04.000Z'),
          },
          {
            id: 'run-refund-1',
            stream: 'REFUND',
            status: 'SUCCESS',
            scannedCount: 1,
            matchedCount: 1,
            mismatchCount: 0,
            missingCount: 0,
            errorMessage: null,
            startedAt: new Date('2026-07-21T09:02:00.000Z'),
            finishedAt: new Date('2026-07-21T09:02:03.000Z'),
            createdAt: new Date('2026-07-21T09:02:00.000Z'),
            updatedAt: new Date('2026-07-21T09:02:03.000Z'),
          },
          {
            id: 'run-transfer-1',
            stream: 'TRANSFER',
            status: 'FAILED',
            scannedCount: 1,
            matchedCount: 0,
            mismatchCount: 0,
            missingCount: 0,
            errorMessage: 'Transfer reconciliation failed.',
            startedAt: new Date('2026-07-21T09:03:00.000Z'),
            finishedAt: new Date('2026-07-21T09:03:01.000Z'),
            createdAt: new Date('2026-07-21T09:03:00.000Z'),
            updatedAt: new Date('2026-07-21T09:03:01.000Z'),
          },
        ])
        .mockResolvedValueOnce([
          {
            id: 'record-1',
            runId: 'run-capture-1',
            stream: 'CAPTURE',
            status: 'MISMATCH',
            currency: 'CHF',
            expectedAmount: '18.50',
            actualAmount: '17.00',
            deltaAmount: '-1.50',
            reference: 'trip-1',
            externalReference: 'ch_trip_1',
            tripId: 'trip-1',
            walletTopUpId: null,
            transferId: null,
            refundId: null,
            captureId: 'hold-1',
            customerId: 'customer-1',
            driverId: null,
            customerName: 'Trip Customer',
            customerEmail: 'trip@example.com',
            driverName: null,
            driverEmail: null,
            reason: 'Captured payment totals do not match across hold, request, and settlement.',
            resolvedAt: null,
            createdAt: new Date('2026-07-21T09:01:04.000Z'),
            updatedAt: new Date('2026-07-21T09:01:04.000Z'),
          },
        ])
        .mockResolvedValueOnce([{ count: 1n }]),
    };
    const service = new AdminService(
      prisma as never,
      {} as never,
      {} as never,
    );

    const result = await service.findPaymentReconciliation({
      page: 1,
      limit: 20,
      stream: 'all',
      status: 'all',
    });

    expect(result.total).toBe(1);
    expect(result.summary).toEqual({
      walletCount: 2,
      captureCount: 3,
      refundCount: 1,
      transferCount: 1,
      mismatchCount: 1,
      failedJobCount: 1,
    });
    expect(result.items[0]).toEqual({
      id: 'record-1',
      stream: 'captures',
      status: 'mismatch',
      currency: 'CHF',
      expectedAmount: 18.5,
      actualAmount: 17,
      deltaAmount: -1.5,
      reference: 'trip-1',
      externalReference: 'ch_trip_1',
      tripId: 'trip-1',
      walletTopUpId: null,
      transferId: null,
      refundId: null,
      captureId: 'hold-1',
      customer: {
        id: 'customer-1',
        name: 'Trip Customer',
        email: 'trip@example.com',
      },
      driver: null,
      reason: 'Captured payment totals do not match across hold, request, and settlement.',
      jobRunId: 'run-capture-1',
      detectedAt: '2026-07-21T09:01:04.000Z',
      resolvedAt: null,
      createdAt: '2026-07-21T09:01:04.000Z',
      updatedAt: '2026-07-21T09:01:04.000Z',
    });
  });
});
