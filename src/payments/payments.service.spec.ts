import { AdditionalChargeStatus, PaymentStatus, Prisma } from '@prisma/client';

import { PaymentsService } from './payments.service';

describe('PaymentsService', () => {
  const service = new PaymentsService({} as never, {} as never);

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
          walletDeduction: {
            amount: number;
            currency: string;
            transactionType: 'ADDITIONAL_CHARGE';
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
      status: AdditionalChargeStatus.CAPTURED,
      createdAt: new Date('2026-07-03T08:00:00.000Z'),
      updatedAt: new Date('2026-07-03T08:05:00.000Z'),
    });

    expect(response.invoice).toEqual({
      originalFilename: 'invoice.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: 2048,
    });
    expect(response.walletDeduction).toEqual({
      amount: 19.95,
      currency: 'CHF',
      transactionType: 'ADDITIONAL_CHARGE',
    });
  });
});
