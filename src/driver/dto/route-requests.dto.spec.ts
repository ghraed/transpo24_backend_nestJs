import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RouteRequestsDto } from './route-requests.dto';
describe('route request search validation', () => {
  const coordinates = [
    { latitude: 0, longitude: 0 },
    { latitude: 0, longitude: 2 },
  ];
  it('accepts a valid route and custom radius', async () => {
    expect(
      await validate(
        plainToInstance(RouteRequestsDto, { coordinates, radiusKm: 7.5 }),
      ),
    ).toEqual([]);
  });
  it.each([
    { coordinates, radiusKm: 0 },
    { coordinates, radiusKm: 51 },
    { coordinates: [coordinates[0]], radiusKm: 5 },
    {
      coordinates: [{ latitude: 91, longitude: 0 }, coordinates[1]],
      radiusKm: 5,
    },
    {
      coordinates: [{ latitude: '0', longitude: 0 }, coordinates[1]],
      radiusKm: 5,
    },
  ])('rejects an invalid search payload', async (payload) => {
    expect(
      (await validate(plainToInstance(RouteRequestsDto, payload))).length,
    ).toBeGreaterThan(0);
  });
});
