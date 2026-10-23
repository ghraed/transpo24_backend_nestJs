import {
  cancellationFeeRate,
  driverDetailsAvailable,
  driverTrackingAvailable,
} from './booking-policy';

describe('paid booking timing policy', () => {
  const paidAt = new Date('2026-10-19T12:00:00Z');
  it.each([
    [0, 0, false],
    [599999, 0, false],
    [600000, 0, false],
    [600001, 0.15, true],
    [86400000, 0.15, true],
    [86400001, 0.5, true],
  ])(
    'applies the fee and disclosure rules at %i ms',
    (elapsed, rate, available) => {
      const now = paidAt.getTime() + elapsed;
      expect(cancellationFeeRate(paidAt, now)).toBe(rate);
      expect(driverDetailsAvailable(paidAt, 'DRIVER_ASSIGNED', now)).toBe(
        available,
      );
      expect(driverDetailsAvailable(paidAt, 'CANCELLED', now)).toBe(false);
    },
  );
  it('does not start either clock before successful payment', () => {
    expect(cancellationFeeRate(null)).toBe(0);
    expect(driverDetailsAvailable(null, 'RESERVED')).toBe(false);
  });
});

describe('driver tracking access', () => {
  it.each([
    'ACCEPTED',
    'DRIVER_ASSIGNED',
    'DRIVER_GOING_TO_PICKUP',
    'DRIVER_ARRIVED_PICKUP',
    'PICKUP_IN_PROGRESS',
    'ITEM_PICKED_UP',
    'IN_TRANSIT',
    'DRIVER_GOING_TO_DROPOFF',
    'DELIVERED',
    'COMPLETED',
  ])('keeps tracking available immediately after payment in %s', (status) => {
    expect(driverTrackingAvailable(new Date(), status)).toBe(true);
    expect(driverTrackingAvailable(null, status)).toBe(false);
  });
  it.each(['PENDING_QUOTES', 'QUOTED', 'RESERVED', 'CANCELLED'])(
    'does not expose driver locations in %s',
    (status) => {
      expect(driverTrackingAvailable(new Date(), status)).toBe(false);
    },
  );
});
