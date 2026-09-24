import { DriverService } from './driver.service';

it.each(['CHF', null])('preserves request currency (%s) and geography in driver responses', (currency) => {
  const service = new DriverService({} as never, {} as never, {} as never);
  const mapper = service as unknown as {
    toRequestDetailsResponse: (request: unknown, alert: unknown, distance: null, offer: null) => Record<string, unknown>;
  };
  const response = mapper.toRequestDetailsResponse({
    id: 'swiss-job', currency, pickupCountryCode: 'CH', destinationCountryCode: 'FR',
    createdAt: new Date(), photos: [],
  }, { id: 'alert', createdAt: new Date() }, null, null);
  expect(response).toMatchObject({ requestId: 'swiss-job', currency, pickupCountryCode: 'CH', destinationCountryCode: 'FR' });
});
