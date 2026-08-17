jest.mock('../notifications/notifications.service', () => ({
  NotificationsService: class NotificationsServiceMock {},
}));

import { BadRequestException } from '@nestjs/common';
import {
  AdditionalChargeStatus,
  CustomerWalletTopUpStatus,
  PaymentStatus,
  Prisma,
  TripPaymentSettlementStatus,
  TransportRequestStatus,
} from '@prisma/client';

import { PaymentsService } from './payments.service';

describe('PaymentsService', () => {
  const service = new PaymentsService({} as never, {} as never, {} as never);

  it('converts decimals to Stripe minor units', () => {
    expect(
      (
        service as unknown as {
          toStripeMinorUnit(amount: Prisma.Decimal): number;
        }
      ).toStripeMinorUnit(new Prisma.Decimal('25.50')),
    ).toBe(2550);
  });

  it('computes available wallet balance excluding reserved funds', () => {
    const available = (
      service as unknown as {
        getAvailableBalance(wallet: {
          balance: Prisma.Decimal;
          reservedBalance: Prisma.Decimal;
        }): Prisma.Decimal;
      }
    ).getAvailableBalance({
      balance: new Prisma.Decimal('100.00'),
      reservedBalance: new Prisma.Decimal('35.25'),
    });

    expect(available.toString()).toBe('64.75');
  });

  it('maps a succeeded Stripe intent to a captured payment status', () => {
    expect(
      (
        service as unknown as {
          mapStripeIntentStatus(paymentIntent: {
            status: string;
          }): PaymentStatus;
        }
      ).mapStripeIntentStatus({
        status: 'succeeded',
      }),
    ).toBe(PaymentStatus.PAYMENT_CAPTURED);
  });

  it('maps additional charge invoice metadata into the typed response', () => {
    const response = (
      service as unknown as {
        toAdditionalChargeResponseDto(charge: {
          id: string;
          requestId: string;
          driverId: string;
          customerId: string;
          amount: Prisma.Decimal;
          currency: string;
          reason: string;
          equipmentType: string | null;
          invoiceUrl: string;
          invoiceOriginalFilename: string | null;
          invoiceMimeType: string | null;
          invoiceSizeBytes: number | null;
          approvedAt: Date | null;
          approvedByCustomerId: string | null;
          approvalLocale: string | null;
          approvalConfirmationText: string | null;
          stripePaymentIntentId: string | null;
          stripeChargeId: string | null;
          savedPaymentMethodId: string | null;
          savedPaymentMethodBrand: string | null;
          savedPaymentMethodLast4: string | null;
          savedPaymentMethodExpMonth: number | null;
          savedPaymentMethodExpYear: number | null;
          paymentFailureReason: string | null;
          status: AdditionalChargeStatus;
          createdAt: Date;
          updatedAt: Date;
        }): {
          appFeeAmount: number;
          totalChargeAmount: number;
          invoice: {
            originalFilename: string | null;
            mimeType: string | null;
            sizeBytes: number | null;
          };
          approval: {
            approvedAt: string | null;
            approvedByCustomerId: string | null;
            confirmationLocale: string | null;
            confirmationText: string | null;
          };
          payment: {
            paymentOption: 'SAVED_CARD' | 'CASH_ON_DELIVERY' | null;
            stripePaymentIntentId: string | null;
            stripeChargeId: string | null;
            savedPaymentMethod: {
              id: string;
              brand: string | null;
              last4: string | null;
              expMonth: number | null;
              expYear: number | null;
            } | null;
            failureReason: string | null;
          };
        };
      }
    ).toAdditionalChargeResponseDto({
      id: 'charge-1',
      requestId: 'request-1',
      driverId: 'driver-1',
      customerId: 'customer-1',
      amount: new Prisma.Decimal('19.95'),
      currency: 'CHF',
      reason: 'Crane fee',
      equipmentType: 'CRANE',
      invoiceUrl: '/uploads/invoice.jpg',
      invoiceOriginalFilename: 'invoice.jpg',
      invoiceMimeType: 'image/jpeg',
      invoiceSizeBytes: 2048,
      approvedAt: new Date('2026-07-03T08:03:00.000Z'),
      approvedByCustomerId: 'customer-1',
      approvalLocale: 'en',
      approvalConfirmationText: 'Agree',
      stripePaymentIntentId: 'pi_123',
      stripeChargeId: 'ch_123',
      savedPaymentMethodId: 'pm_123',
      savedPaymentMethodBrand: 'visa',
      savedPaymentMethodLast4: '4242',
      savedPaymentMethodExpMonth: 12,
      savedPaymentMethodExpYear: 2030,
      paymentFailureReason: null,
      status: AdditionalChargeStatus.CAPTURED,
      createdAt: new Date('2026-07-03T08:00:00.000Z'),
      updatedAt: new Date('2026-07-03T08:05:00.000Z'),
    });

    expect(response.invoice).toEqual({
      originalFilename: 'invoice.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: 2048,
    });
    expect(response.appFeeAmount).toBe(0);
    expect(response.totalChargeAmount).toBe(19.95);
    expect(response.approval).toEqual({
      approvedAt: '2026-07-03T08:03:00.000Z',
      approvedByCustomerId: 'customer-1',
      confirmationLocale: 'en',
      confirmationText: 'Agree',
    });
    expect(response.payment).toEqual({
      paymentOption: 'SAVED_CARD',
      stripePaymentIntentId: 'pi_123',
      stripeChargeId: 'ch_123',
      savedPaymentMethod: {
        id: 'pm_123',
        brand: 'visa',
        last4: '4242',
        expMonth: 12,
        expYear: 2030,
      },
      failureReason: null,
    });
  });

  it('rejects additional charge approval after the trip is delivered', async () => {
    const prisma = {
      additionalCharge: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'charge-1',
          requestId: 'request-1',
          customerId: 'customer-1',
          status: AdditionalChargeStatus.PENDING,
          approvalInFlightAt: null,
        }),
      },
      transportRequest: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'request-1',
          customerId: 'customer-1',
          status: TransportRequestStatus.DELIVERED,
        }),
      },
    };
    const serviceWithPrisma = new PaymentsService(
      prisma as never,
      {} as never,
      {} as never,
    );

    await expect(
      serviceWithPrisma.approveAdditionalCharge({
        customerId: 'customer-1',
        requestId: 'request-1',
        chargeId: 'charge-1',
        confirmationLocale: 'en',
        confirmationText: 'Agree',
        paymentOption: 'CASH_ON_DELIVERY',
      }),
    ).rejects.toThrow(
      new BadRequestException('This additional charge request has expired.'),
    );
  });

  it('schedules the first payout job for the earning availability time', async () => {
    const availableAt = new Date('2026-07-19T10:15:00.000Z');
    const driverEarningFindUnique = jest.fn().mockResolvedValue({
      tripId: 'trip-1',
      availableAt,
      status: 'PENDING',
      stripeTransferId: null,
    });
    const enqueueDriverPayout = jest.fn().mockResolvedValue(true);
    const serviceWithQueue = new PaymentsService(
      { driverEarning: { findUnique: driverEarningFindUnique } } as never,
      {} as never,
      {} as never,
      { enqueueDriverPayout } as never,
    );

    await serviceWithQueue.queueDriverPayoutForTrip('trip-1');

    expect(driverEarningFindUnique).toHaveBeenCalledWith({
      where: { tripId: 'trip-1' },
      select: {
        tripId: true,
        availableAt: true,
        status: true,
        stripeTransferId: true,
      },
    });
    expect(enqueueDriverPayout).toHaveBeenCalledWith({
      tripId: 'trip-1',
      reason: 'delivery',
      runAt: availableAt,
      replaceDelayed: true,
    });
  });

  it('computes the payout retry backoff schedule and stops after the configured attempts', () => {
    const attemptSchedule = (
      service as unknown as {
        calculateNextDriverPayoutRetryAt(
          attemptCount: number,
          attemptedAt: Date,
        ): Date | null;
      }
    ).calculateNextDriverPayoutRetryAt;
    const attemptedAt = new Date('2026-07-19T08:00:00.000Z');

    expect(attemptSchedule(1, attemptedAt)?.toISOString()).toBe(
      '2026-07-19T08:05:00.000Z',
    );
    expect(attemptSchedule(2, attemptedAt)?.toISOString()).toBe(
      '2026-07-19T08:30:00.000Z',
    );
    expect(attemptSchedule(6, attemptedAt)?.toISOString()).toBe(
      '2026-07-20T08:00:00.000Z',
    );
    expect(attemptSchedule(7, attemptedAt)).toBeNull();
  });

  it('maps closed won disputes back to collected trip settlements and succeeded top-ups', () => {
    const servicePrivate = service as unknown as {
      getTripDisputePaymentStatus(
        disputeStatus: string | null,
        eventType: string,
      ): PaymentStatus;
      getTripDisputeSettlementStatus(
        disputeStatus: string | null,
        eventType: string,
      ): TripPaymentSettlementStatus;
      getWalletTopUpDisputeStatus(
        disputeStatus: string | null,
        eventType: string,
      ): CustomerWalletTopUpStatus;
    };

    expect(
      servicePrivate.getTripDisputePaymentStatus(
        'won',
        'charge.dispute.closed',
      ),
    ).toBe(PaymentStatus.PAYMENT_CAPTURED);
    expect(
      servicePrivate.getTripDisputeSettlementStatus(
        'won',
        'charge.dispute.closed',
      ),
    ).toBe(TripPaymentSettlementStatus.COLLECTED);
    expect(
      servicePrivate.getWalletTopUpDisputeStatus(
        'won',
        'charge.dispute.closed',
      ),
    ).toBe(CustomerWalletTopUpStatus.SUCCEEDED);
  });

  it('blocks driver payouts while a disputed settlement requires manual review', async () => {
    const tripPaymentSettlementUpdate = jest.fn().mockResolvedValue(undefined);
    const serviceWithMocks = new PaymentsService(
      {
        tripPaymentSettlement: {
          update: tripPaymentSettlementUpdate,
        },
      } as never,
      {} as never,
      {} as never,
      { enqueueDriverPayout: jest.fn() } as never,
    );

    (
      serviceWithMocks as unknown as {
        getDriverPayoutContext: (tripId: string) => Promise<{
          settlementId: string;
          tripId: string;
          customerId: string;
          driverUserId: string;
          driverId: string;
          currency: string;
          earningId: string;
          earningStatus: string;
          availableAt: Date | null;
          paidOutAt: Date | null;
          netAmount: Prisma.Decimal;
          stripeTransferId: string | null;
          stripeTransferStatus: string | null;
          destinationAccountId: string | null;
          stripePayoutsEnabled: boolean;
          stripeDetailsSubmitted: boolean;
          payoutAttemptCount: number;
          settlementStatus: TripPaymentSettlementStatus;
          requiresManualReview: boolean;
        } | null>;
      }
    ).getDriverPayoutContext = jest.fn().mockResolvedValue({
      settlementId: 'settlement-1',
      tripId: 'trip-1',
      customerId: 'customer-1',
      driverUserId: 'driver-user-1',
      driverId: 'driver-1',
      currency: 'CHF',
      earningId: 'earning-1',
      earningStatus: 'AVAILABLE',
      availableAt: null,
      paidOutAt: null,
      netAmount: new Prisma.Decimal('12.50'),
      stripeTransferId: null,
      stripeTransferStatus: null,
      destinationAccountId: 'acct_123',
      stripePayoutsEnabled: true,
      stripeDetailsSubmitted: true,
      payoutAttemptCount: 0,
      settlementStatus: TripPaymentSettlementStatus.DISPUTED,
      requiresManualReview: true,
    });

    const result = await (
      serviceWithMocks as unknown as {
        attemptDriverPayoutForTrip: (
          tripId: string,
          input: {
            requestedBy:
              | 'automatic_retry'
              | 'driver_manual_retry'
              | 'admin_manual_retry';
          },
        ) => Promise<{
          transferred: boolean;
          stripeTransferId: string | null;
          reason: string | null;
        }>;
      }
    ).attemptDriverPayoutForTrip('trip-1', {
      requestedBy: 'automatic_retry',
    });

    expect(result).toEqual({
      transferred: false,
      stripeTransferId: null,
      reason: 'Stripe dispute requires manual review before payout.',
    });
    expect(tripPaymentSettlementUpdate).toHaveBeenCalledWith({
      where: { id: 'settlement-1' },
      data: {
        nextPayoutRetryAt: null,
        payoutFailureReason:
          'Stripe dispute requires manual review before payout.',
      },
    });
  });

  it('persists trip-charge and wallet-top-up dispute state from Stripe webhooks', async () => {
    const tx = {
      paymentHold: {
        findFirst: jest.fn().mockResolvedValueOnce({
          id: 'hold-1',
          requestId: 'trip-1',
          acceptedOfferId: 'offer-1',
          customerId: 'customer-1',
          driverId: 'driver-1',
          amount: new Prisma.Decimal('18.50'),
          currency: 'CHF',
          paymentMethod: 'CREDIT_CARD',
          provider: 'STRIPE',
          status: PaymentStatus.PAYMENT_CAPTURED,
          stripePaymentIntentId: 'pi_trip_1',
          stripeClientSecret: 'secret',
          stripeChargeId: 'ch_trip_1',
          createdAt: new Date('2026-07-20T09:00:00.000Z'),
          updatedAt: new Date('2026-07-20T09:00:00.000Z'),
        }),
        update: jest.fn().mockResolvedValue(undefined),
      },
      transportRequest: {
        update: jest.fn().mockResolvedValue(undefined),
      },
      tripPaymentSettlement: {
        updateMany: jest.fn().mockResolvedValue(undefined),
      },
      customerWalletTopUp: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce(undefined)
          .mockResolvedValueOnce({
            id: 'topup-1',
            walletId: 'wallet-1',
            customerId: 'customer-1',
            amount: new Prisma.Decimal('25.00'),
            currency: 'CHF',
            paymentMethod: 'CREDIT_CARD',
            provider: 'STRIPE',
            status: CustomerWalletTopUpStatus.SUCCEEDED,
            stripePaymentIntentId: 'pi_topup_1',
            stripeClientSecret: 'secret',
            stripeChargeId: 'ch_topup_1',
            requiresManualReview: false,
            stripeDisputeId: null,
            disputeStatus: null,
            disputeReason: null,
            disputeAmount: null,
            disputeCurrency: null,
            disputeCreatedAt: null,
            disputeUpdatedAt: null,
            disputeClosedAt: null,
            disputeEvidenceDueBy: null,
            failureReason: null,
            completedAt: new Date('2026-07-20T08:00:00.000Z'),
            failedAt: null,
            cancelledAt: null,
            createdAt: new Date('2026-07-20T07:00:00.000Z'),
            updatedAt: new Date('2026-07-20T08:00:00.000Z'),
          }),
        update: jest.fn().mockResolvedValue(undefined),
      },
    };
    const prisma = {
      $transaction: jest
        .fn()
        .mockImplementation(async (callback) => callback(tx)),
    };
    const stripeService = {
      constructWebhookEvent: jest
        .fn()
        .mockReturnValueOnce({
          type: 'charge.dispute.created',
          data: {
            object: {
              id: 'dp_trip_1',
              amount: 1850,
              currency: 'chf',
              reason: 'fraudulent',
              status: 'needs_response',
              charge: 'ch_trip_1',
              payment_intent: 'pi_trip_1',
              created: 1784538000,
              evidence_details: {
                due_by: 1784624400,
              },
            },
          },
        })
        .mockReturnValueOnce({
          type: 'charge.dispute.updated',
          data: {
            object: {
              id: 'dp_topup_1',
              amount: 2500,
              currency: 'chf',
              reason: 'product_not_received',
              status: 'warning_needs_response',
              charge: 'ch_topup_1',
              payment_intent: 'pi_topup_1',
              created: 1784538000,
              evidence_details: {
                due_by: 1784624400,
              },
            },
          },
        }),
    };
    const serviceWithMocks = new PaymentsService(
      prisma as never,
      stripeService as never,
      {} as never,
      { enqueueDriverPayout: jest.fn() } as never,
    );

    await serviceWithMocks.handleStripeWebhook(Buffer.from('{}'), 'sig_trip');
    await serviceWithMocks.handleStripeWebhook(Buffer.from('{}'), 'sig_topup');

    expect(tx.paymentHold.update).toHaveBeenCalledWith({
      where: { id: 'hold-1' },
      data: {
        status: PaymentStatus.PAYMENT_DISPUTED,
        stripeChargeId: 'ch_trip_1',
      },
    });
    expect(tx.transportRequest.update).toHaveBeenCalledWith({
      where: { id: 'trip-1' },
      data: {
        paymentStatus: PaymentStatus.PAYMENT_DISPUTED,
      },
    });
    expect(tx.tripPaymentSettlement.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { requestId: 'trip-1' },
        data: expect.objectContaining({
          status: TripPaymentSettlementStatus.DISPUTED,
          requiresManualReview: true,
          stripeDisputeId: 'dp_trip_1',
          disputeStatus: 'needs_response',
          disputeReason: 'fraudulent',
          disputeAmount: new Prisma.Decimal('18.5'),
          disputeCurrency: 'CHF',
          payoutFailureReason: 'Stripe dispute requires payout review.',
          nextPayoutRetryAt: null,
        }),
      }),
    );
    expect(tx.customerWalletTopUp.update).toHaveBeenNthCalledWith(1, {
      where: { id: 'topup-1' },
      data: expect.objectContaining({
        status: CustomerWalletTopUpStatus.DISPUTED,
        stripeChargeId: 'ch_topup_1',
        requiresManualReview: true,
        stripeDisputeId: 'dp_topup_1',
        disputeStatus: 'warning_needs_response',
        disputeReason: 'product_not_received',
        disputeAmount: new Prisma.Decimal('25'),
        disputeCurrency: 'CHF',
      }),
    });
  });
});
