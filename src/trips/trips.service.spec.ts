import { Prisma } from '@prisma/client';

import { DRIVER_PAYOUT_DELAY_HOURS, TripsService } from './trips.service';

describe('TripsService', () => {
  const service = new TripsService({} as never);

  it('calculates driver earnings with the platform fee deducted', () => {
    const amounts = service.calculateDriverEarningAmounts(
      new Prisma.Decimal('250.00'),
    );

    expect(amounts.grossAmount.toNumber()).toBe(250);
    expect(amounts.platformFeeAmount.toNumber()).toBe(37.5);
    expect(amounts.netAmount.toNumber()).toBe(212.5);
  });

  it('keeps additional expenses out of the platform fee calculation', () => {
    const amounts = service.calculateDriverEarningAmounts(
      new Prisma.Decimal('100.00'),
      new Prisma.Decimal('10.00'),
    );

    expect(amounts.grossAmount.toNumber()).toBe(110);
    expect(amounts.platformFeeAmount.toNumber()).toBe(15);
    expect(amounts.netAmount.toNumber()).toBe(95);
  });

  it('schedules driver payout availability 24 hours after delivery', () => {
    const deliveredAt = new Date('2026-07-03T10:15:00.000Z');

    const availableAt = service.calculateDriverEarningAvailableAt(deliveredAt);

    expect(availableAt.toISOString()).toBe('2026-07-04T10:15:00.000Z');
    expect(availableAt.getTime() - deliveredAt.getTime()).toBe(
      DRIVER_PAYOUT_DELAY_HOURS * 60 * 60 * 1000,
    );
  });
});
