import { DayOfWeek } from '@prisma/client';
import { DriverService } from './driver.service';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  UpdateDriverAvailabilityDto,
  UpdateDriverMatchingLocationDto,
} from './dto/update-driver-availability.dto';

function setup() {
  const now = new Date();
  const pins = [{ city: 'Zurich', latitude: 47.38, longitude: 8.54 }];
  const stored = {
    id: 'availability',
    driverId: 'driver',
    timezone: 'Europe/Zurich',
    isOnline: true,
    serviceRadiusKm: 30,
    baseLatitude: 47.38,
    baseLongitude: 8.54,
    baseAddress: 'Zurich',
    cityCoverage: pins,
    acceptsImmediateRequests: true,
    acceptsScheduledRequests: true,
    createdAt: now,
    updatedAt: now,
    schedule: Object.values(DayOfWeek).map((dayOfWeek) => ({
      dayOfWeek,
      isAvailable: true,
      startTime: '08:00',
      endTime: '18:00',
    })),
  };
  const upsert = jest.fn().mockResolvedValue({ id: 'availability' });
  const updateMany = jest.fn().mockResolvedValue({ count: 1 });
  const update = jest.fn().mockResolvedValue(stored);
  const tx = {
    driverAvailability: {
      upsert,
      findUnique: jest.fn().mockResolvedValue(stored),
    },
    driverAvailabilitySchedule: {
      deleteMany: jest.fn(),
      createMany: jest.fn(),
    },
  };
  const prisma = {
    $transaction: jest.fn(async (callback) => callback(tx)),
    driverAvailability: {
      findUnique: jest.fn().mockResolvedValue(stored),
      updateMany,
      update,
    },
  };
  const service = new DriverService(prisma as never, {} as never, {} as never);
  Object.assign(service, {
    ensureDriverProfile: jest.fn().mockResolvedValue({
      id: 'driver',
      cities: ['Zurich'],
      isProfileCompleted: true,
      status: 'APPROVED',
    }),
    ensureDriverVehicleDocumentsReady: jest.fn().mockResolvedValue(undefined),
  });
  const payload = {
    userId: 'user',
    timezone: stored.timezone,
    isOnline: true,
    serviceRadiusKm: 30,
    baseLatitude: 47.38,
    baseLongitude: 8.54,
    cityCoverage: pins,
    acceptsImmediateRequests: true,
    acceptsScheduledRequests: true,
    weeklySchedule: stored.schedule,
  };
  return { service, prisma, payload, stored, upsert, updateMany, update };
}
describe('coverage settings and latest matching location', () => {
  it('persists and returns city pins alongside the shared radius', async () => {
    const { service, payload, upsert } = setup();
    const response = await service.updateAvailability(payload);
    expect(response.cityCoverage).toEqual(payload.cityCoverage);
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          cityCoverage: payload.cityCoverage,
          serviceRadiusKm: 30,
        }),
        update: expect.objectContaining({ cityCoverage: payload.cityCoverage }),
      }),
    );
  });
  it('preserves existing pins when older clients omit the field', async () => {
    const { service, payload, upsert } = setup();
    await service.updateAvailability({ ...payload, cityCoverage: undefined });
    expect(upsert.mock.calls[0][0].update.cityCoverage).toEqual(
      payload.cityCoverage,
    );
  });
  it.each(['missing', 'duplicate', 'unselected', 'invalid'])(
    'rejects %s city coverage',
    async (mode) => {
      const { service, payload, upsert } = setup();
      const pin = payload.cityCoverage[0];
      payload.cityCoverage =
        mode === 'missing'
          ? []
          : mode === 'duplicate'
            ? [pin, pin]
            : mode === 'unselected'
              ? [{ ...pin, city: 'Geneva' }]
              : [{ ...pin, latitude: 100 }];
      await expect(service.updateAvailability(payload)).rejects.toThrow();
      expect(upsert).not.toHaveBeenCalled();
    },
  );
  it('requires a base for immediate coverage, even when there are scheduled city pins', async () => {
    const { service, payload } = setup();
    await expect(
      service.updateAvailability({
        ...payload,
        baseLatitude: undefined,
        baseLongitude: undefined,
      }),
    ).rejects.toThrow('Set a base');
  });
  it('requires an upgrade to incomplete saved coverage before going online but always permits going offline', async () => {
    const { service, stored, update } = setup();
    stored.cityCoverage = [];
    await expect(
      service.updateOnlineStatus({ userId: 'user', isOnline: true }),
    ).rejects.toThrow('Set a coverage pin');
    await expect(
      service.updateOnlineStatus({ userId: 'user', isOnline: false }),
    ).resolves.toBeDefined();
    expect(update.mock.calls[0][0].data).toMatchObject({
      isOnline: false,
      liveLatitude: null,
      liveLongitude: null,
      liveLocationAt: null,
    });
  });
  it('updates only the latest live fix for online drivers, without changing base or city coverage', async () => {
    const { service, updateMany } = setup();
    const recordedAt = Date.now() - 1000;
    await service.updateMatchingLocation('user', {
      latitude: 46.2,
      longitude: 6.14,
      recordedAt,
    });
    expect(updateMany.mock.calls[0][0]).toEqual({
      where: {
        driverId: 'driver',
        isOnline: true,
        OR: [
          { liveLocationAt: null },
          { liveLocationAt: { lte: new Date(recordedAt) } },
        ],
      },
      data: {
        liveLatitude: 46.2,
        liveLongitude: 6.14,
        liveLocationAt: new Date(recordedAt),
      },
    });
  });
  it.each([-121000, 60000])(
    'rejects stale or future timestamps (%s ms)',
    async (delta) => {
      const { service, updateMany } = setup();
      await expect(
        service.updateMatchingLocation('user', {
          latitude: 46.2,
          longitude: 6.14,
          recordedAt: Date.now() + delta,
        }),
      ).rejects.toThrow('recent');
      expect(updateMany).not.toHaveBeenCalled();
    },
  );
  it('clears the live fix when location services are disabled', async () => {
    const { service, updateMany } = setup();
    await service.updateMatchingLocation('user', null);
    expect(updateMany.mock.calls[0][0].data).toEqual({
      liveLatitude: null,
      liveLongitude: null,
      liveLocationAt: null,
    });
  });
  it('validates nested pins and GPS coordinates at the HTTP boundary', async () => {
    const { payload } = setup();
    const invalid = plainToInstance(UpdateDriverAvailabilityDto, {
      ...payload,
      cityCoverage: [{ city: 'Zurich', latitude: 91, longitude: 0 }],
    });
    expect(
      (await validate(invalid)).some(
        (error) => error.property === 'cityCoverage',
      ),
    ).toBe(true);
    expect(
      await validate(
        plainToInstance(UpdateDriverMatchingLocationDto, {
          latitude: 0,
          longitude: 181,
          recordedAt: Date.now(),
        }),
      ),
    ).toHaveLength(1);
  });
});
