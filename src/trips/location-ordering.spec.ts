import { locationMeasurement } from './location-ordering';
const now = new Date('2026-11-04T12:00:00Z');
test.each([
  undefined,
  'invalid',
  '2026-11-04T11:57:59Z',
  '2026-11-04T12:00:11Z',
])('rejects missing/stale/future GPS time %s', (value) => {
  expect(() => locationMeasurement(value, now)).toThrow();
});
test.each([
  '2026-11-04T11:58:00Z',
  '2026-11-04T12:00:10Z',
  '2026-11-04T12:00:00Z',
])('accepts a bounded native measurement %s', (value) => {
  expect(locationMeasurement(value, now).toISOString()).toBe(
    new Date(value).toISOString(),
  );
});
