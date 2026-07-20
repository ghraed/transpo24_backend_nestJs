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
});
