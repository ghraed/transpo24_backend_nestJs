import { AdditionalChargeStatus, PaymentStatus, Prisma } from '@prisma/client';

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

  it('maps a Stripe capturable intent to a held payment status', () => {
    expect(
      (
        service as unknown as {
          mapStripeIntentStatus(paymentIntent: {
            status: string;
          }): PaymentStatus;
        }
      ).mapStripeIntentStatus({
        status: 'requires_capture',
      }),
    ).toBe(PaymentStatus.PAYMENT_HELD);
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
          status: AdditionalChargeStatus;
          createdAt: Date;
          updatedAt: Date;
        }): {
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
    expect(response.appFeeAmount).toBe(2);
    expect(response.totalChargeAmount).toBe(21.95);
    expect(response.approval).toEqual({
      approvedAt: '2026-07-03T08:03:00.000Z',
      approvedByCustomerId: 'customer-1',
      confirmationLocale: 'en',
      confirmationText: 'Agree',
    });
    expect(response.payment).toEqual({
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
});
