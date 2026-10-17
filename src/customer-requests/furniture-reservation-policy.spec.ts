import {
  bookingDay,
  confirmationWindow,
  reservationSummary,
  shouldDeferTransportPayment,
  HOUR,
} from './furniture-reservation-policy';
describe('furniture reservation policy', () => {
  const now = new Date('2026-10-17T07:00:00Z');
  it('defers only furniture beyond five local calendar days at acceptance', () => {
    expect(
      shouldDeferTransportPayment(
        'FURNITURE_TRANSPORT',
        new Date('2026-10-22T20:59:00Z'),
        'Asia/Beirut',
        now,
      ),
    ).toBe(false);
    expect(
      shouldDeferTransportPayment(
        'FURNITURE_TRANSPORT',
        new Date('2026-10-22T21:00:00Z'),
        'Asia/Beirut',
        now,
      ),
    ).toBe(true);
    expect(
      shouldDeferTransportPayment(
        'GOODS_TRANSPORT',
        new Date('2026-11-17'),
        'UTC',
        now,
      ),
    ).toBe(false);
    expect(
      shouldDeferTransportPayment('FURNITURE_TRANSPORT', null, 'UTC', now),
    ).toBe(false);
  });
  it('uses calendar boundaries across DST and different timezones', () => {
    expect(bookingDay(new Date('2026-10-22T23:30:00Z'), 'Asia/Beirut')).toBe(
      Date.UTC(2026, 9, 23),
    );
    expect(
      bookingDay(new Date('2026-10-23T03:00:00Z'), 'America/Los_Angeles'),
    ).toBe(Date.UTC(2026, 9, 22));
    expect(
      shouldDeferTransportPayment(
        'FURNITURE_TRANSPORT',
        new Date('2026-10-28T10:00:00Z'),
        'Europe/Zurich',
        new Date('2026-10-23T08:00:00Z'),
      ),
    ).toBe(false);
  });
  it('opens exactly 48 hours before pickup and closes exactly 24 hours before', () => {
    const pickup = new Date('2026-11-10T10:00:00Z');
    const times = confirmationWindow(pickup);
    expect(pickup.getTime() - times.confirmationOpensAt.getTime()).toBe(
      48 * HOUR,
    );
    expect(pickup.getTime() - times.paymentDeadlineAt.getTime()).toBe(
      24 * HOUR,
    );
    const request = {
      status: 'RESERVED',
      deferredPaymentState: 'WAITING',
      ...times,
    };
    expect(
      reservationSummary(
        request,
        new Date(times.confirmationOpensAt.getTime() - 1),
      )?.canConfirmAndPay,
    ).toBe(false);
    expect(
      reservationSummary(request, times.confirmationOpensAt)?.canConfirmAndPay,
    ).toBe(true);
    expect(
      reservationSummary(request, times.paymentDeadlineAt)?.canConfirmAndPay,
    ).toBe(false);
    expect(
      reservationSummary(
        { ...request, status: 'CANCELLED' },
        times.confirmationOpensAt,
      )?.canConfirmAndPay,
    ).toBe(false);
  });
});

it.each(['FURNITURE_TRANSPORT'])(
  '%s defers beyond the fifth local calendar day only',
  (serviceKey) => {
    const now = new Date('2026-10-17T07:00:00Z');
    expect(
      shouldDeferTransportPayment(
        serviceKey,
        new Date('2026-10-22T20:59:00Z'),
        'Asia/Beirut',
        now,
      ),
    ).toBe(false);
    expect(
      shouldDeferTransportPayment(
        serviceKey,
        new Date('2026-10-22T21:00:00Z'),
        'Asia/Beirut',
        now,
      ),
    ).toBe(true);
  },
);
it.each(['GOODS_TRANSPORT', 'MOTORCYCLE_TRANSPORT', 'VEHICLE_TRANSPORT'])(
  '%s keeps immediate payment acceptance',
  (serviceKey) => {
    expect(
      shouldDeferTransportPayment(
        serviceKey,
        new Date('2026-11-10'),
        'UTC',
        new Date('2026-10-17'),
      ),
    ).toBe(false);
  },
);
