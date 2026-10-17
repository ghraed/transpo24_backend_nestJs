import { assertScheduleWindow } from './schedule-window';
const now = new Date(2026, 9, 17, 10);
const day = (offset: number) => new Date(2026, 9, 17 + offset, 12);
const check =
  (pickup: Date, delivery?: Date, furniture = false, immediate = false) =>
  () =>
    assertScheduleWindow({ pickup, delivery, furniture, immediate, now });
describe('request scheduling window', () => {
  it.each([0, 1, 2, 3, 4])(
    'accepts pickup day %i and next day delivery',
    (offset) => {
      expect(check(day(offset), day(offset + 1))).not.toThrow();
    },
  );
  it('rejects the seventh pickup day and later', () => {
    expect(check(day(6))).toThrow(
      'Pickup must be between today and five days ahead.',
    );
  });
  it.each([-1, 6])('rejects delivery day %i', (offset) => {
    expect(check(day(0), day(offset))).toThrow(
      'Delivery must be between today and five days ahead.',
    );
  });
  it('rejects same-day and earlier delivery', () => {
    expect(check(day(2), day(2))).toThrow(
      'Delivery date must be after the pickup date.',
    );
    expect(check(day(2), day(1))).toThrow(
      'Delivery date must be after the pickup date.',
    );
  });
  it('uses today for immediate pickup', () => {
    expect(check(day(20), day(1), false, true)).not.toThrow();
    expect(check(day(20), day(0), false, true)).toThrow(
      'Delivery date must be after the pickup date.',
    );
  });
  it('preserves the furniture pickup exemption and global delivery limit', () => {
    expect(check(day(20), undefined, true)).not.toThrow();
    expect(check(day(20), day(21), true)).not.toThrow();
    expect(check(day(20), day(25), true)).not.toThrow();
    expect(check(day(20), day(20), true)).not.toThrow();
    expect(check(day(20), day(26), true)).toThrow(
      'Furniture delivery must be on pickup day or within five days after pickup.',
    );
  });
  it('accepts missing delivery for existing clients', () => {
    expect(check(day(0))).not.toThrow();
  });
  it('rejects invalid and past dates', () => {
    expect(check(day(-1))).toThrow('Scheduled pickup must be in the future.');
    expect(check(new Date('invalid'))).toThrow(
      'Scheduled pickup must be in the future.',
    );
    expect(check(day(0), new Date('invalid'))).toThrow(
      'Delivery must be between today and five days ahead.',
    );
  });
});

describe('customer calendar timezone', () => {
  it('accepts the last available day in America/Los_Angeles even when UTC is already on the seventh day', () => {
    expect(() =>
      assertScheduleWindow({
        immediate: false,
        now: new Date('2026-10-17T17:00:00Z'),
        pickup: new Date('2026-10-21T22:00:00Z'),
        delivery: new Date('2026-10-23T03:00:00Z'),
        timeZone: 'America/Los_Angeles',
      }),
    ).not.toThrow();
  });
  it('compares pickup and delivery days in Beirut rather than UTC', () => {
    expect(() =>
      assertScheduleWindow({
        immediate: false,
        now: new Date('2026-10-17T07:00:00Z'),
        pickup: new Date('2026-10-17T21:30:00Z'),
        delivery: new Date('2026-10-18T09:00:00Z'),
        timeZone: 'Asia/Beirut',
      }),
    ).toThrow('Delivery date must be after the pickup date.');
  });
  it('uses calendar days across daylight-saving transitions', () => {
    expect(() =>
      assertScheduleWindow({
        immediate: false,
        now: new Date('2026-10-23T08:00:00Z'),
        pickup: new Date('2026-10-27T09:00:00Z'),
        delivery: new Date('2026-10-28T11:00:00Z'),
        timeZone: 'Europe/Zurich',
      }),
    ).not.toThrow();
  });
});

describe('vehicle uses the standard goods schedule', () => {
  const now = new Date('2026-10-17T07:00:00Z');
  const check = (pickup: string, delivery: string) => () =>
    assertScheduleWindow({
      immediate: false,
      pickup: new Date(pickup),
      delivery: new Date(delivery),
      timeZone: 'Asia/Beirut',
      now,
    });
  it('accepts later delivery within today through five days ahead', () => {
    expect(check('2026-10-17T08:00:00Z', '2026-10-22T10:00:00Z')).not.toThrow();
  });
  it('rejects distant pickup, same-day delivery and out-of-window delivery', () => {
    expect(check('2026-10-23T08:00:00Z', '2026-10-24T10:00:00Z')).toThrow(
      'Pickup must be between today and five days ahead.',
    );
    expect(check('2026-10-17T08:00:00Z', '2026-10-17T10:00:00Z')).toThrow(
      'Delivery date must be after the pickup date.',
    );
    expect(check('2026-10-22T08:00:00Z', '2026-10-23T10:00:00Z')).toThrow(
      'Delivery must be between today and five days ahead.',
    );
  });
});

describe('required dates on submission', () => {
  const now = new Date('2026-10-17T07:00:00Z');
  it.each([false, true])(
    'requires pickup and delivery for submitted schedules (furniture=%s)',
    (furniture) => {
      const options = { immediate: false, furniture, now, requireDates: true };
      expect(() => assertScheduleWindow(options)).toThrow(
        'Please select a pickup date.',
      );
      expect(() =>
        assertScheduleWindow({
          ...options,
          pickup: new Date('2026-10-18T08:00:00Z'),
        }),
      ).toThrow('Please select a delivery date.');
      expect(() =>
        assertScheduleWindow({ ...options, immediate: true }),
      ).toThrow('Please select a delivery date.');
      expect(() =>
        assertScheduleWindow({
          ...options,
          pickup: new Date('2026-10-18T08:00:00Z'),
          delivery: new Date('2026-10-19T08:00:00Z'),
        }),
      ).not.toThrow();
    },
  );
});
