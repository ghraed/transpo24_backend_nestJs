import { cancellationFeeRate, driverDetailsAvailable } from './booking-policy';

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
