import * as transport from './google-routes.transport';
import {
  BadGatewayException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ComputeDriverRouteDto } from './routes.dto';
import { RoutesService } from './routes.service';
import { RoutesRateLimitGuard } from './routes.controller';

const input = {
  origin: { latitude: 47.38, longitude: 8.54, placeId: 'origin' },
  destination: { latitude: 47.4, longitude: 8.6 },
  alternatives: true,
};
const config = { get: jest.fn(() => 'server-only-key') };
const service = new RoutesService(config as unknown as ConfigService);
beforeEach(() => {
  jest.restoreAllMocks();
  config.get.mockReturnValue('server-only-key');
});
afterEach(() => jest.restoreAllMocks());

it('preserves alternatives and metrics without returning the private key', async () => {
  const call = jest.spyOn(transport, 'requestGoogleRoutes').mockResolvedValue({
    routes: [
      {
        description: 'A1',
        distanceMeters: 1234,
        duration: '125.5s',
        polyline: { encodedPolyline: 'route' },
      },
    ],
  });
  const result = await service.compute(input);
  expect(result).toEqual({
    status: 'OK',
    routes: [
      {
        summary: 'A1',
        overview_polyline: { points: 'route' },
        legs: [{ distance: { value: 1234 }, duration: { value: 125.5 } }],
      },
    ],
  });
  expect(call).toHaveBeenCalledWith(
    'server-only-key',
    expect.objectContaining({
      origin: { placeId: 'origin' },
      destination: { location: { latLng: input.destination } },
      computeAlternativeRoutes: true,
    }),
  );
  expect(JSON.stringify(result)).not.toContain('server-only-key');
});
it('returns zero results distinctly and hides provider errors', async () => {
  const call = jest
    .spyOn(transport, 'requestGoogleRoutes')
    .mockResolvedValue({});
  expect(await service.compute(input)).toEqual({
    status: 'ZERO_RESULTS',
    routes: [],
  });
  call.mockRejectedValue(
    new Error('server-only-key provider rejected request'),
  );
  await expect(service.compute(input)).rejects.toThrow(BadGatewayException);
  await expect(service.compute(input)).rejects.toThrow('Routes unavailable.');
});
it('does not call Google when the server key is missing', async () => {
  config.get.mockReturnValue('');
  const fetcher = jest.spyOn(transport, 'requestGoogleRoutes');
  await expect(service.compute(input)).rejects.toThrow(
    ServiceUnavailableException,
  );
  expect(fetcher).not.toHaveBeenCalled();
});
it('rejects malformed provider route data', async () => {
  jest
    .spyOn(transport, 'requestGoogleRoutes')
    .mockResolvedValue({ routes: [{ duration: 'oops' }] });
  await expect(service.compute(input)).rejects.toThrow(BadGatewayException);
});
it.each([
  { ...input, origin: { latitude: 91, longitude: 8 } },
  { destination: input.destination },
  { ...input, alternatives: 'true' },
])('rejects invalid route inputs', async (data) => {
  expect(
    (await validate(plainToInstance(ComputeDriverRouteDto, data))).length,
  ).toBeGreaterThan(0);
});
it('requires identity and limits route calls using the shared counter', async () => {
  const counters = {
    incrementRateLimitCounter: jest.fn().mockResolvedValue(31),
  };
  const guard = new RoutesRateLimitGuard(counters as never);
  const context = (user?: { id: string }) =>
    ({ switchToHttp: () => ({ getRequest: () => ({ user }) }) }) as never;
  await expect(guard.canActivate(context())).rejects.toMatchObject({
    status: 401,
  });
  await expect(
    guard.canActivate(context({ id: 'driver' })),
  ).rejects.toMatchObject({ status: 429 });
  expect(counters.incrementRateLimitCounter).toHaveBeenCalledWith(
    'routes:minute:driver',
    60,
  );
});
