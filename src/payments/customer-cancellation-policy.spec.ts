import { Prisma } from '@prisma/client';
import {
  customerCancellationAmounts,
  isFreeCancellationWindow,
} from './booking-policy';

describe('customer cancellation before pickup', () => {
  const now = Date.parse('2026-11-17T12:00:00Z');
  const day = 24 * 60 * 60 * 1000;
  const quote = (remaining: number, immediate = false, free = false) =>
    customerCancellationAmounts(
      new Prisma.Decimal(105),
      new Prisma.Decimal(5),
      new Date(now + remaining),
      immediate,
      now,
      free,
    );

  it.each([
    [20 * day, '90', '0', '15'],
    [20 * day - 1, '80', '10', '15'],
    [7 * day, '80', '10', '15'],
    [7 * day - 1, '70', '20', '15'],
    [48 * 60 * 60 * 1000 + 1, '70', '20', '15'],
    [48 * 60 * 60 * 1000, '55', '35', '15'],
  ])(
    'splits a CHF 105 payment at %i ms before pickup',
    (remaining, refund, driver, platform) => {
      const result = quote(remaining);
      expect(result.refund.toString()).toBe(refund);
      expect(result.driver.toString()).toBe(driver);
      expect(result.platform.toString()).toBe(platform);
      expect(result.refund.add(result.retained).toString()).toBe('105');
    },
  );

  it('uses the under-48-hour tier for an immediate request', () => {
    expect(quote(30 * day, true).refund.toString()).toBe('55');
  });

  it('returns the whole payment during the free window or a driver cancellation', () => {
    const result = quote(0, true, true);
    expect(result.refund.toString()).toBe('105');
    expect(result.retained.toString()).toBe('0');
  });

  it('keeps exactly ten minutes free unless the customer confirmed early', () => {
    const started = new Date(now);
    expect(isFreeCancellationWindow(started, null, now + 600000)).toBe(true);
    expect(
      isFreeCancellationWindow(started, new Date(now + 600000), now + 600000),
    ).toBe(true);
    expect(
      isFreeCancellationWindow(started, new Date(now + 1000), now + 600000),
    ).toBe(false);
    expect(isFreeCancellationWindow(started, null, now + 600001)).toBe(false);
  });

  it('rounds each allocation in cents while returning the service fee', () => {
    const result = customerCancellationAmounts(
      new Prisma.Decimal('21.00'),
      new Prisma.Decimal('1.00'),
      new Date(now + 48 * 60 * 60 * 1000),
      false,
      now,
    );
    expect(result.refund.toString()).toBe('11');
    expect(result.driver.toString()).toBe('7');
    expect(result.platform.toString()).toBe('3');
  });
});
