import { PaymentStatus, Prisma } from '@prisma/client';

import { PaymentsService } from './payments.service';

describe('PaymentsService', () => {
  const service = new PaymentsService({} as never, {} as never);

  it('converts decimals to Stripe minor units', () => {
    expect(
      (service as unknown as { toStripeMinorUnit(amount: Prisma.Decimal): number }).toStripeMinorUnit(
        new Prisma.Decimal('25.50'),
      ),
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
          mapStripeIntentStatus(paymentIntent: { status: string }): PaymentStatus;
        }
      ).mapStripeIntentStatus({
        status: 'requires_capture',
      }),
    ).toBe(PaymentStatus.PAYMENT_HELD);
  });
});
