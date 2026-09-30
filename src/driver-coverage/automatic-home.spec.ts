import { DriverCoverageService } from './driver-coverage.service';
import { MatchingService } from '../matching/matching.service';
import type { PrismaService } from '../prisma/prisma.service';

function fixture(status = 'APPROVED', home: string | null = 'LB') {
  const country = {
    upsert: jest.fn(),
    updateMany: jest.fn(),
    deleteMany: jest.fn(),
    findUniqueOrThrow: jest
      .fn()
      .mockResolvedValue({ countryCode: home, status: 'APPROVED' }),
  };
  const route = {
    upsert: jest.fn(),
    updateMany: jest.fn(),
    deleteMany: jest.fn(),
    findUniqueOrThrow: jest.fn().mockResolvedValue({
      fromCountryCode: home,
      toCountryCode: home,
      status: 'APPROVED',
    }),
  };
  const transaction = jest.fn();
  const prisma = {
    $transaction: transaction,
    driverProfile: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'driver',
        status,
        user: {
          role: 'DRIVER',
          deletedAt: null,
          tenant: home ? { countryCode: home } : null,
        },
      }),
    },
    driverOperationalCountry: country,
    driverRoutePermission: route,
  };
  transaction.mockImplementation(
    (callback: (db: unknown) => Promise<unknown>) => callback(prisma),
  );
  return {
    service: new DriverCoverageService(prisma as unknown as PrismaService),
    prisma,
    country,
    route,
  };
}

describe('automatic home-market grants', () => {
  it('creates approved pickup, dropoff, and domestic route records for an approved driver', async () => {
    const { service, country, route } = fixture();
    await service.reconcileHome('driver');
    expect(country.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          countryCode: 'LB',
          canPickup: true,
          canDropoff: true,
          status: 'APPROVED',
          isAutoHomeGrant: true,
        }),
        update: {},
      }),
    );
    expect(route.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          fromCountryCode: 'LB',
          toCountryCode: 'LB',
          status: 'APPROVED',
          isAutoHomeGrant: true,
        }),
        update: {},
      }),
    );
    expect(country.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: 'PENDING',
          reviewedByAdminId: null,
        }),
        data: expect.objectContaining({
          canPickup: true,
          canDropoff: true,
          isAutoHomeGrant: true,
        }),
      }),
    );
    expect(route.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: 'PENDING',
          reviewedByAdminId: null,
        }),
      }),
    );
  });

  it('does not grant an unapproved driver or one without a reviewed tenant', async () => {
    for (const [status, home] of [
      ['PENDING_REVIEW', 'LB'],
      ['APPROVED', null],
    ] as const) {
      const { service, country, route } = fixture(status, home);
      await expect(service.reconcileHome('driver')).resolves.toBeNull();
      expect(country.upsert).not.toHaveBeenCalled();
      expect(route.upsert).not.toHaveBeenCalled();
    }
  });

  it('removes only prior automatic grants on a home-market change', async () => {
    const { service, country, route } = fixture('APPROVED', 'CH');
    await service.reconcileHome('driver');
    expect(country.deleteMany).toHaveBeenCalledWith({
      where: {
        driverId: 'driver',
        isAutoHomeGrant: true,
        countryCode: { not: 'CH' },
      },
    });
    expect(route.deleteMany).toHaveBeenCalledWith({
      where: {
        driverId: 'driver',
        isAutoHomeGrant: true,
        OR: [
          { fromCountryCode: { not: 'CH' } },
          { toCountryCode: { not: 'CH' } },
        ],
      },
    });
  });

  it('marks an admin decision as manual so reconciliation cannot replace it', async () => {
    const { service, country, route } = fixture();
    await service.reviewCountry(
      'driver',
      {
        countryCode: 'LB',
        canPickup: true,
        canDropoff: false,
        status: 'APPROVED',
      },
      'admin',
    );
    await service.reviewRoute(
      'driver',
      { fromCountryCode: 'LB', toCountryCode: 'LB', status: 'SUSPENDED' },
      'admin',
    );
    expect(country.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          canDropoff: false,
          isAutoHomeGrant: false,
          reviewedByAdminId: 'admin',
        }),
      }),
    );
    expect(route.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          status: 'SUSPENDED',
          isAutoHomeGrant: false,
          reviewedByAdminId: 'admin',
        }),
      }),
    );
  });

  it('queries route blocks using only route country codes during refresh', async () => {
    const { prisma } = fixture();
    const routeBlock = {
      findMany: jest
        .fn()
        .mockResolvedValue([
          { fromCountryCode: 'LB', toCountryCode: 'LB', transportType: null },
        ]),
    };
    const db = {
      ...prisma,
      driverProfile: {
        ...prisma.driverProfile,
        findFirst: jest.fn().mockResolvedValue({
          user: { tenant: { countryCode: 'LB' } },
          availability: { isOnline: true },
          operationalCountries: [
            {
              countryCode: 'LB',
              canPickup: true,
              canDropoff: true,
              isAutoHomeGrant: true,
            },
          ],
          routePermissions: [
            {
              fromCountryCode: 'LB',
              toCountryCode: 'LB',
              isAutoHomeGrant: true,
            },
          ],
          vehicles: [],
        }),
      },
      transportRequest: {
        findMany: jest.fn().mockResolvedValueOnce([
          {
            id: 'request',
            pickupCountryCode: 'LB',
            destinationCountryCode: 'LB',
            service: { key: 'VEHICLE_TRANSPORT' },
            driverAlerts: [],
          },
        ]),
      },
      routeBlock,
    };
    await new MatchingService(db as unknown as PrismaService).refreshDriver(
      'driver',
    );
    expect(routeBlock.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          isActive: true,
          OR: [{ fromCountryCode: 'LB', toCountryCode: 'LB' }],
        },
      }),
    );
  });

  it('does not authorize a stale automatic grant for a different home market', () => {
    const { prisma } = fixture();
    const matching = new MatchingService(prisma as unknown as PrismaService);
    const driver = {
      user: { tenant: { countryCode: 'CH' } },
      operationalCountries: [
        {
          countryCode: 'LB',
          canPickup: true,
          canDropoff: true,
          isAutoHomeGrant: true,
        },
      ],
      routePermissions: [
        { fromCountryCode: 'LB', toCountryCode: 'LB', isAutoHomeGrant: true },
      ],
    };
    expect(
      (
        matching as never as {
          operational: (request: unknown, driver: unknown) => boolean;
        }
      ).operational(
        { pickupCountryCode: 'LB', destinationCountryCode: 'LB' },
        driver,
      ),
    ).toBe(false);
  });
});
