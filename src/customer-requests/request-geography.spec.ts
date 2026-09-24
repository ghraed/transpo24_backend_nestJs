import {
  BadRequestException,
  ServiceUnavailableException,
  ValidationPipe,
} from '@nestjs/common';
import {
  RequestGeographyService,
  normalizeRequestCountry,
} from './request-geography.service';
import { CustomerRequestsService } from './customer-requests.service';
import { CreateGoodsTransportRequestDto } from './dto/create-goods-transport-request.dto';

const pickup = {
  latitude: 33.89,
  longitude: 35.5,
  address: 'Switzerland',
  placeId: 'untrusted-place',
};
const destination = { latitude: 34.43, longitude: 35.83 };
const response = (...codes: string[]) => ({
  ok: true,
  json: async () => ({
    status: 'OK',
    results: codes.map((short_name) => ({
      address_components: [{ types: ['country'], short_name }],
    })),
  }),
});

describe('authoritative request geography', () => {
  const env = { ...process.env };
  let fetchMock: jest.SpyInstance;
  const db = {
    user: { findUnique: jest.fn() },
    tenant: { findUnique: jest.fn() },
  };
  let geography: RequestGeographyService;
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.GOOGLE_MAPS_API_KEY = 'test-only-key';
    process.env.REQUEST_GEOGRAPHY_REQUIRED = 'true';
    fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(response(' lb ') as Response);
    db.user.findUnique.mockResolvedValue({ tenantId: 'tenant-ch' });
    db.tenant.findUnique.mockResolvedValue({ id: 'tenant-lb' });
    geography = new RequestGeographyService(db as never);
  });
  afterEach(() => {
    fetchMock.mockRestore();
    process.env = { ...env };
  });

  it('keeps CH ownership independent from LB pickup and destination, ignoring address/place claims', async () => {
    await expect(
      geography.route('customer', pickup, destination),
    ).resolves.toEqual({
      customerTenantId: 'tenant-ch',
      originTenantId: 'tenant-lb',
      pickupCountryCode: 'LB',
      destinationCountryCode: 'LB',
      currency: 'USD',
    });
    const url = new URL(fetchMock.mock.calls[0][0] as string);
    expect(url.searchParams.get('latlng')).toBe('33.89,35.5');
    expect(url.searchParams.has('place_id')).toBe(false);
    expect(db.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'customer' },
      select: { tenantId: true },
    });
    expect(db.tenant.findUnique).toHaveBeenCalledWith({
      where: { countryCode: 'LB' },
      select: { id: true },
    });
  });
  it('allows cross-border geography even when pickup has no platform tenant', async () => {
    db.tenant.findUnique.mockResolvedValue(null);
    fetchMock
      .mockResolvedValueOnce(response('FR'))
      .mockResolvedValueOnce(response('CH'));
    await expect(
      geography.route('customer', pickup, destination),
    ).resolves.toMatchObject({
      pickupCountryCode: 'FR',
      destinationCountryCode: 'CH',
      originTenantId: null,
      currency: 'EUR',
    });
  });
  it.each(['ZZ', 'UK', 'France', '12', '', 'AAA'])(
    'rejects non-ISO country %s',
    (value) => {
      expect(normalizeRequestCountry(value)).toBeNull();
    },
  );
  it.each([[], ['ZZ'], ['LB', 'CH']])(
    'rejects absent or ambiguous provider countries: %j',
    async (...codes) => {
      fetchMock.mockResolvedValue(response(...codes));
      await expect(geography.country(pickup)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    },
  );
  it('does not leak provider failures or credentials', async () => {
    fetchMock.mockRejectedValue(new Error('test-only-key upstream failure'));
    await expect(geography.country(pickup)).rejects.toThrow(
      'Location verification is temporarily unavailable. Try again.',
    );
  });
  it('rejects provider denial instead of guessing geography', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'REQUEST_DENIED' }),
    });
    await expect(geography.country(pickup)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
  it('allows incomplete drafts without geocoding', async () => {
    await expect(
      geography.country({ latitude: null, longitude: null }),
    ).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('only permits missing provider configuration during compatibility rollout', async () => {
    delete process.env.GOOGLE_MAPS_API_KEY;
    await expect(geography.country(pickup)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    process.env.REQUEST_GEOGRAPHY_REQUIRED = 'false';
    db.user.findUnique.mockResolvedValue({ tenantId: null });
    await expect(
      geography.route('legacy', pickup, destination),
    ).resolves.toEqual({
      customerTenantId: null,
      originTenantId: null,
      pickupCountryCode: null,
      destinationCountryCode: null,
      currency: null,
    });
  });
  it('rejects invalid coordinates without contacting Google', async () => {
    await expect(
      geography.country({ latitude: 91, longitude: 10 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('request geography write paths', () => {
  const env = { ...process.env };
  let fetchMock: jest.SpyInstance;
  let row: Record<string, unknown>;
  let db: ReturnType<typeof makeDb>;
  let service: CustomerRequestsService;
  function makeDb() {
    return {
      user: {
        findUnique: jest.fn().mockResolvedValue({ tenantId: 'tenant-ch' }),
      },
      tenant: { findUnique: jest.fn().mockResolvedValue({ id: 'tenant-lb' }) },
      service: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'service',
          isActive: true,
          key: 'VEHICLE_TRANSPORT',
        }),
      },
      transportRequest: {
        create: jest
          .fn()
          .mockImplementation(({ data }: { data: Record<string, unknown> }) => {
            row = { ...row, ...data };
            return Promise.resolve(row);
          }),
        update: jest
          .fn()
          .mockImplementation(({ data }: { data: Record<string, unknown> }) => {
            row = { ...row, ...data };
            return Promise.resolve(row);
          }),
        findUnique: jest.fn().mockImplementation(() => Promise.resolve(row)),
      },
    };
  }
  beforeEach(() => {
    process.env.GOOGLE_MAPS_API_KEY = 'test-only-key';
    fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(response('LB') as Response);
    row = {
      id: 'request',
      customerId: 'customer',
      status: 'DRAFT',
      serviceId: 'service',
      pickupLatitude: pickup.latitude,
      pickupLongitude: pickup.longitude,
      dropoffLatitude: destination.latitude,
      dropoffLongitude: destination.longitude,
    };
    db = makeDb();
    service = new CustomerRequestsService(
      db as never,
      {} as never,
      {} as never,
      {} as never,
      {
        notifyDriversAboutNewTransportRequest: jest
          .fn()
          .mockResolvedValue(undefined),
      } as never,
    );
    Object.assign(service, {
      toResponseDto: (value: unknown) => value,
      validateSubmittedRequest: jest.fn().mockResolvedValue(undefined),
      dispatchSubmittedRequestToEligibleDrivers: jest
        .fn()
        .mockResolvedValue({ driverNotifications: [], summary: {} }),
    });
  });
  afterEach(() => {
    fetchMock.mockRestore();
    process.env = { ...env };
  });
  const common = {
    customerId: 'customer',
    pickupLocation: pickup,
    deliveryLocation: destination,
    isImmediate: true,
  };
  const expected = {
    customerTenantId: 'tenant-ch',
    originTenantId: 'tenant-lb',
    pickupCountryCode: 'LB',
    destinationCountryCode: 'LB',
    currency: 'USD',
  };

  it('derives vehicle draft ownership and resolves both location updates', async () => {
    await service.createDraftRequest({
      customerId: 'customer',
      serviceId: 'service',
      vehicleCondition: 'RUNNING',
    });
    expect(row.customerTenantId).toBe('tenant-ch');
    expect(fetchMock).not.toHaveBeenCalled();
    await service.updatePickupLocation({
      customerId: 'customer',
      requestId: 'request',
      ...pickup,
    });
    await service.updateDropoffLocation({
      customerId: 'customer',
      requestId: 'request',
      ...destination,
    });
    expect(row).toMatchObject(expected);
  });
  it('persists motorcycle geography', async () => {
    await service.createMotorcycleTransportRequest({
      ...common,
      motorcycleType: 'SPORT_BIKE',
      motorcycleCondition: 'WORKING',
      requiresSpecialWrapping: false,
      requiresDedicatedCarrier: false,
    });
    expect(row).toMatchObject(expected);
  });
  it('persists goods geography and ignores raw tenant claims at the service boundary', async () => {
    const input = {
      ...common,
      shipmentSize: 'S' as const,
      goodsDescription: 'Boxes',
      approximateWeightKg: 20,
      numberOfPieces: 1,
      isFragile: false,
      requiresRefrigeration: false,
      customerTenantId: 'forged',
      originTenantId: 'forged',
    };
    await service.createGoodsTransportRequest(input);
    expect(row).toMatchObject(expected);
  });
  it('persists furniture geography', async () => {
    await service.createFurnitureTransportRequest({
      ...common,
      furnitureDescription: 'Sofa',
      approximateItemCount: 1,
      movingDate: new Date(Date.now() + 86400000),
      files: [
        {
          path: '/tmp/geography-photo.jpg',
          originalname: 'photo.jpg',
          mimetype: 'image/jpeg',
          size: 100,
        } as never,
      ],
    });
    expect(row).toMatchObject(expected);
  });
  it('resolves legacy drafts on submission and preserves existing currency', async () => {
    row.currency = 'CHF';
    await service.submitCustomerRequest({
      customerId: 'customer',
      requestId: 'request',
    });
    expect(row).toMatchObject({
      ...expected,
      currency: 'CHF',
      status: 'PENDING_QUOTES',
    });
  });
  it('does not mutate or dispatch a request when geography fails', async () => {
    fetchMock.mockRejectedValue(new Error('timeout'));
    await expect(
      service.submitCustomerRequest({
        customerId: 'customer',
        requestId: 'request',
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(db.transportRequest.update).not.toHaveBeenCalled();
  });
  it('rejects unauthorized location changes before calling Google', async () => {
    await expect(
      service.updatePickupLocation({
        customerId: 'attacker',
        requestId: 'request',
        ...pickup,
      }),
    ).rejects.toThrow('You are not allowed');
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('rejects raw tenant and country fields through HTTP validation', async () => {
    const pipe = new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    const valid = {
      pickupLocation: pickup,
      deliveryLocation: destination,
      isImmediate: true,
      shipmentSize: 'S',
      goodsDescription: 'Boxes',
      approximateWeightKg: 20,
      numberOfPieces: 1,
      isFragile: false,
      requiresRefrigeration: false,
    };
    const metadata = {
      type: 'body' as const,
      metatype: CreateGoodsTransportRequestDto,
    };
    await expect(pipe.transform(valid, metadata)).resolves.toBeInstanceOf(
      CreateGoodsTransportRequestDto,
    );
    await expect(
      pipe.transform(
        { ...valid, customerTenantId: 'forged', pickupCountryCode: 'CH' },
        metadata,
      ),
    ).rejects.toMatchObject({
      response: {
        message: expect.arrayContaining([
          'property customerTenantId should not exist',
          'property pickupCountryCode should not exist',
        ]),
      },
    });
  });
});
