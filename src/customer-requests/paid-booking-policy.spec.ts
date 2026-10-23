import { Prisma } from '@prisma/client';
import { CustomerRequestsService } from './customer-requests.service';

describe('customer booking disclosure', () => {
  const now = new Date('2026-10-19T12:00:00Z');
  beforeEach(() => jest.useFakeTimers().setSystemTime(now));
  afterEach(() => jest.useRealTimers());
  function setup(elapsed: number, status = 'DRIVER_ASSIGNED') {
    const row = {
      id: 'request',
      customerId: 'customer',
      status,
      service: { key: 'GOODS_TRANSPORT' },
      paymentHold: {
        acceptedOfferId: 'offer',
        amount: new Prisma.Decimal('100.10'),
        customerPlatformFeeAmount: new Prisma.Decimal(0),
        status: 'PAYMENT_CAPTURED',
        capturedAt: new Date(now.getTime() - elapsed),
      },
      paymentSettlement: {
        collectedAmount: new Prisma.Decimal(100.1),
        currency: 'CHF',
      },
      assignedDriverId: 'driver',
      assignedDriver: {
        firstName: 'Alex',
        lastName: '',
        driverType: 'COMPANY',
        vehicles: [
          {
            make: 'Truck',
            model: 'A',
            plateNumber: 'ABC',
            documents: [{ url: 'photo' }],
          },
        ],
      },
      driverLocations: [{ latitude: 1, longitude: 2, recordedAt: now }],
      proofPhotos: [],
      createdAt: now,
      updatedAt: now,
    };
    const offer = {
      id: 'offer',
      requestId: 'request',
      driverId: 'driver',
      price: new Prisma.Decimal(100.1),
      currency: 'CHF',
      status: 'ACCEPTED',
      createdAt: now,
      acceptedAt: now,
      message: 'Contact Alex directly',
      driver: {
        firstName: 'Alex',
        lastName: '',
        driverType: 'COMPANY',
        profilePhotoUrl: 'profile-photo',
        averageRating: new Prisma.Decimal(4.5),
        vehicles: [{ documents: [{ url: 'vehicle-photo' }] }],
      },
    };
    const db = {
      transportRequest: { findUnique: jest.fn(async () => row) },
      driverOffer: { findMany: jest.fn(async () => [offer]) },
    };
    const service = new CustomerRequestsService(
      db as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    return { row, service, db };
  }
  it.each([
    [600000, false],
    [600001, true],
  ])(
    'reveals tracking immediately and delays contact details at %i ms',
    async (elapsed, visible) => {
      const { row, service } = setup(elapsed);
      const mapper = service as any;
      jest.spyOn(mapper, 'toResponseDto').mockReturnValue({});
      const status = mapper.toStatusResponseDto(row);
      const tracking = await service.getCustomerRequestTracking({
        requestId: 'request',
        customerId: 'customer',
      });
      expect(status.driverDetailsAvailable).toBe(visible);
      expect(status.driverSummary.driverType).toBe('COMPANY');
      expect(tracking.driverType).toBe('COMPANY');
      expect(status.driverSummary.driverName).toBe(visible ? 'Alex' : null);
      expect(status.driverSummary.vehicleInfo).toBe(
        visible ? 'Truck A (ABC)' : null,
      );
      expect(status.trackingSummary.available).toBe(true);
      expect(tracking.driverName).toBe(visible ? 'Alex' : null);
      expect(tracking.driverVehiclePhoto).toBe(visible ? 'photo' : null);
      expect(Boolean(tracking.latestDriverLocation)).toBe(true);
    },
  );
  it.each([
    [600000, 100.1],
    [600001, 85.09],
    [86400000, 85.09],
    [86400001, 50.05],
  ])('previews the monetary refund after %i ms', (elapsed, expected) => {
    const { row, service } = setup(elapsed);
    expect(
      (service as any).toCancellationStatus(row).refundPreview.refundedAmount,
    ).toBe(expected);
  });
  it('unlocks offer identities only after the paid booking grace period elapses', async () => {
    const { service, row } = setup(0);
    // An older request/offer must not cause immediate disclosure on payment.
    row.createdAt = new Date(now.getTime() - 7 * 86400000);
    const getOffer = async () =>
      (
        await service.getCustomerRequestOffers({
          requestId: 'request',
          customerId: 'customer',
        })
      ).offers[0];
    for (const elapsed of [0, 599999, 600000]) {
      jest.setSystemTime(now.getTime() + elapsed);
      const offer = await getOffer();
      expect(offer).toMatchObject({
        id: 'offer',
        price: 100.1,
        driverName: null,
        driverVehiclePhoto: null,
        message: null,
      });
    }
    jest.setSystemTime(now.getTime() + 600001);
    expect(await getOffer()).toMatchObject({
      driverName: 'Alex',
      driverVehiclePhoto: 'vehicle-photo',
      message: 'Contact Alex directly',
    });
    row.status = 'CANCELLED';
    expect(await getOffer()).toMatchObject({
      driverName: null,
      driverVehiclePhoto: null,
      message: null,
    });
  });

  it('does not disclose offers or tracking when a booking has not been paid', async () => {
    const { service, db, row } = setup(86400001);
    db.transportRequest.findUnique.mockResolvedValue({
      ...row,
      paymentHold: null,
    } as never);
    const offers = await service.getCustomerRequestOffers({
      requestId: 'request',
      customerId: 'customer',
    });
    expect(offers.offers[0]).toMatchObject({
      driverName: null,
      driverVehiclePhoto: null,
      message: null,
    });
    const tracking = await service.getCustomerRequestTracking({
      requestId: 'request',
      customerId: 'customer',
    });
    expect(tracking).toMatchObject({
      assignedDriverId: null,
      driverName: null,
      driverVehiclePhoto: null,
      latestDriverLocation: null,
    });
  });

  it('rejects another customer even after the disclosure time', async () => {
    const { service, db } = setup(86400001);
    await expect(
      service.getCustomerRequestOffers({
        requestId: 'request',
        customerId: 'other',
      }),
    ).rejects.toThrow('not allowed');
    expect(db.driverOffer.findMany).not.toHaveBeenCalled();
    await expect(
      service.getCustomerRequestTracking({
        requestId: 'request',
        customerId: 'other',
      }),
    ).rejects.toThrow('not allowed');
  });

  it('never discloses a cancelled booking driver', async () => {
    const { service } = setup(86400001, 'CANCELLED');
    const tracking = await service.getCustomerRequestTracking({
      requestId: 'request',
      customerId: 'customer',
    });
    expect(tracking.driverName).toBeNull();
    expect(tracking.latestDriverLocation).toBeNull();
  });
});
