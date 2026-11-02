import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { getTripConfirmationRadiusMeters } from '../config/trip-confirmation';
import { PickupItemDto } from '../driver/dto/pickup-item.dto';
import { DeliverItemDto } from '../driver/dto/deliver-item.dto';
import { TripsService } from './trips.service';

describe('trip confirmation distance', () => {
  const originalEnvironment = { ...process.env };
  afterEach(() => {
    process.env = { ...originalEnvironment };
  });

  it.each([
    [{}, 100],
    [{ NODE_ENV: 'production', ENABLE_TEST_ENDPOINTS: 'true' }, 100],
    [{ NODE_ENV: 'development' }, 100],
    [{ NODE_ENV: 'development', ENABLE_TEST_ENDPOINTS: 'false' }, 100],
    [{ ENABLE_TEST_ENDPOINTS: 'true' }, 2000],
    [{ NODE_ENV: 'development', ENABLE_TEST_ENDPOINTS: 'true' }, 2000],
  ])('selects a trusted backend policy for %j', (environment, radius) => {
    expect(getTripConfirmationRadiusMeters(environment)).toBe(radius);
  });

  const setup = () => {
    const prisma = {
      transportRequest: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'trip',
          pickupLatitude: 0,
          pickupLongitude: 0,
          driverArrivedPickupAt: null,
        }),
      },
      $transaction: jest
        .fn()
        .mockRejectedValue(new Error('PASSED_DISTANCE_CHECK')),
    };
    const service = new TripsService(prisma as never, {} as never);
    Object.assign(service, {
      validateDriverCanAccessTrip: jest
        .fn()
        .mockResolvedValue({ id: 'trip', status: 'DRIVER_GOING_TO_PICKUP' }),
    });
    const internal = service as unknown as {
      validatePickupCoordinates(input: object): void;
      validateDeliveryCoordinates(input: object): void;
    };
    return { service, internal, prisma };
  };

  it.each([
    ['production', 'true', 100],
    ['development', 'true', 2000],
    ['development', 'false', 100],
  ])(
    'enforces arrival, pickup and dropoff boundaries in %s (test endpoints %s)',
    async (mode, enabled, radius) => {
      process.env.NODE_ENV = mode;
      process.env.ENABLE_TEST_ENDPOINTS = enabled;
      const { service, internal } = setup();
      const distance = jest.spyOn(service, 'calculateDistanceMeters');
      const input = {
        latitude: 0,
        longitude: 0,
        pickupLatitude: 0,
        pickupLongitude: 0,
        dropoffLatitude: 0,
        dropoffLongitude: 0,
      };
      for (const metres of [radius - 0.01, radius]) {
        distance.mockReturnValue(metres);
        expect(() => internal.validatePickupCoordinates(input)).not.toThrow();
        expect(() => internal.validateDeliveryCoordinates(input)).not.toThrow();
        await expect(
          service.markDriverArrivedAtPickup({
            tripId: 'trip',
            driverId: 'driver',
            latitude: 0,
            longitude: 0,
          }),
        ).rejects.toThrow('PASSED_DISTANCE_CHECK');
      }
      distance.mockReturnValue(radius + 0.01);
      expect(() => internal.validatePickupCoordinates(input)).toThrow(
        'too far from pickup',
      );
      expect(() => internal.validateDeliveryCoordinates(input)).toThrow(
        'too far from dropoff',
      );
      await expect(
        service.markDriverArrivedAtPickup({
          tripId: 'trip',
          driverId: 'driver',
          latitude: 0,
          longitude: 0,
        }),
      ).rejects.toThrow('too far from pickup');
    },
  );

  it('cannot bypass distance checks by omitting or invalidating GPS coordinates', () => {
    const { internal } = setup();
    for (const invalid of [
      {},
      { latitude: 0 },
      { longitude: 0 },
      { latitude: NaN, longitude: 0 },
      { latitude: 0, longitude: Infinity },
    ]) {
      expect(() =>
        internal.validatePickupCoordinates({
          ...invalid,
          pickupLatitude: 0,
          pickupLongitude: 0,
        }),
      ).toThrow();
      expect(() =>
        internal.validateDeliveryCoordinates({
          ...invalid,
          dropoffLatitude: 0,
          dropoffLongitude: 0,
        }),
      ).toThrow();
    }
  });

  it.each([PickupItemDto, DeliverItemDto])(
    'parses multipart GPS fields while preserving strict validation for %p',
    async (dto) => {
      const coordinates = plainToInstance(dto, {
        latitude: '0',
        longitude: '35.5018',
      });
      expect(await validate(coordinates)).toHaveLength(0);
      expect(coordinates.latitude).toBe(0);
      expect(coordinates.longitude).toBe(35.5018);
      for (const latitude of [
        '',
        ' ',
        'not-a-number',
        'NaN',
        'Infinity',
        '91',
        null,
        undefined,
      ]) {
        expect(
          (
            await validate(
              plainToInstance(dto, { latitude, longitude: '35.5018' }),
            )
          ).length,
        ).toBeGreaterThan(0);
      }
      for (const longitude of [
        '',
        ' ',
        'not-a-number',
        'Infinity',
        '181',
        null,
        undefined,
      ]) {
        expect(
          (await validate(plainToInstance(dto, { latitude: '0', longitude })))
            .length,
        ).toBeGreaterThan(0);
      }
    },
  );

  it.each([PickupItemDto, DeliverItemDto])(
    'requires coordinates in the HTTP request DTO %p',
    async (dto) => {
      expect(await validate(plainToInstance(dto, {}))).toHaveLength(2);
      expect(
        await validate(plainToInstance(dto, { latitude: 0, longitude: 0 })),
      ).toHaveLength(0);
    },
  );
});
