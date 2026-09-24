import { ConflictException } from '@nestjs/common';
import { DriverService } from './driver.service';
import {
  requestDetailsVersion,
  REQUEST_VERSION_SELECT,
} from './request-details-version';

jest.mock('./request-eligibility', () => ({
  ...jest.requireActual('./request-eligibility'),
  isEligibleRequest: jest.fn(() => true),
}));

const snapshot = () => ({
  ...Object.fromEntries(
    Object.keys(REQUEST_VERSION_SELECT).map((key) => [key, null]),
  ),
  id: 'request',
  currency: 'EUR',
  customerId: 'customer',
  status: 'PENDING_QUOTES',
  itemTitle: 'Goods',
  itemType: 'GOODS',
  isImmediate: true,
  pickupLatitude: 1,
  pickupLongitude: 2,
  dropoffLatitude: 3,
  dropoffLongitude: 4,
  customerNote: 'Handle carefully',
  photos: [{ id: 'photo', url: '/photo.jpg', sortOrder: 0 }],
  driverAlerts: [{ id: 'alert', driverId: 'driver', status: 'ACCEPTED' }],
});
const version = (request: object) =>
  requestDetailsVersion(request as Parameters<typeof requestDetailsVersion>[0]);

function setup() {
  const request = snapshot();
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    transportRequest: {
      findUnique: jest.fn().mockImplementation(() => Promise.resolve(request)),
      update: jest.fn().mockResolvedValue({ id: 'request', status: 'QUOTED' }),
    },
    driverAvailability: { findUnique: jest.fn().mockResolvedValue({}) },
    driverOffer: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'offer' }),
    },
  };
  const notifications = {
    notifyCustomerAboutDriverOffer: jest.fn().mockResolvedValue(undefined),
  };
  const service = new DriverService(
    {
      ...tx,
      $transaction: jest.fn((fn: (client: typeof tx) => Promise<unknown>) =>
        fn(tx),
      ),
    } as never,
    {} as never,
    notifications as never,
    { assertCanOffer: jest.fn().mockResolvedValue(undefined) } as never,
  );
  // Constructor order is Prisma, gateway, notifications.
  Object.assign(service, {
    ensureDriverProfile: jest
      .fn()
      .mockResolvedValue({ id: 'driver', countryCode: 'DE' }),
    ensureDriverOnboardingForAlerts: jest.fn(),
    getApprovedDriverVehiclesTx: jest.fn().mockResolvedValue([]),
    toDriverOfferResponse: jest.fn().mockReturnValue({ id: 'offer' }),
  });
  const input = {
    userId: 'user',
    requestId: 'request',
    price: 100,
    currency: 'EUR',
    requestVersion: version(request),
  };
  return { service, tx, request, input, notifications };
}

describe('request content version', () => {
  it.each(Object.keys(REQUEST_VERSION_SELECT))(
    'detects a change to %s',
    (key) => {
      const request = snapshot();
      expect(version({ ...request, [key]: 'changed' })).not.toBe(
        version(request),
      );
    },
  );
  it('detects photo additions, removal, replacement and reordering', () => {
    const request = snapshot();
    for (const photos of [
      [],
      [...request.photos, { id: 'new', url: '/new', sortOrder: 1 }],
      [{ ...request.photos[0], url: '/replacement' }],
      [{ ...request.photos[0], sortOrder: 1 }],
    ]) {
      expect(version({ ...request, photos })).not.toBe(version(request));
    }
  });
  it('ignores offer/status/alert changes and database photo ordering', () => {
    const request = {
      ...snapshot(),
      photos: [
        { id: 'b', url: '/b', sortOrder: 1 },
        { id: 'a', url: '/a', sortOrder: 0 },
      ],
    };
    expect(
      version({
        ...request,
        status: 'QUOTED',
        updatedAt: new Date(),
        driverAlerts: [],
        photos: [...request.photos].reverse(),
      }),
    ).toBe(version(request));
  });
});

describe('offer snapshot guard', () => {
  it.each([undefined, '', 'outdated'])(
    'rejects missing or stale version %s without creating an offer',
    async (requestVersion) => {
      const { service, tx, input, notifications } = setup();
      await expect(
        service.sendDriverPriceOffer({ ...input, requestVersion }),
      ).rejects.toMatchObject({
        response: { code: 'REQUEST_DETAILS_CHANGED' },
        status: 409,
      });
      expect(tx.driverOffer.create).not.toHaveBeenCalled();
      expect(tx.transportRequest.update).not.toHaveBeenCalled();
      expect(
        notifications.notifyCustomerAboutDriverOffer,
      ).not.toHaveBeenCalled();
    },
  );
  it('rejects an edit committed while waiting for the request lock', async () => {
    const { service, tx, request, input } = setup();
    tx.$queryRaw.mockImplementation(async () => {
      expect(tx.transportRequest.findUnique).not.toHaveBeenCalled();
      request.customerNote = 'New instructions';
      return [];
    });
    await expect(service.sendDriverPriceOffer(input)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(tx.$queryRaw.mock.calls[0][0].join('?')).toContain('FOR UPDATE');
    expect(tx.driverOffer.create).not.toHaveBeenCalled();
  });
  it.each(['PENDING_QUOTES', 'QUOTED'])(
    'sends an offer for matching details with status %s',
    async (status) => {
      const { service, tx, request, input } = setup();
      request.status = status;
      await expect(service.sendDriverPriceOffer(input)).resolves.toMatchObject({
        offer: { id: 'offer' },
      });
      expect(tx.driverOffer.create).toHaveBeenCalledTimes(1);
      const select = tx.transportRequest.findUnique.mock.calls[0][0].select;
      for (const key of Object.keys(REQUEST_VERSION_SELECT))
        expect(select[key]).toBe(true);
    },
  );
});
