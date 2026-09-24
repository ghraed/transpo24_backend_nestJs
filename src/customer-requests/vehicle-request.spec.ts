import { BadRequestException } from '@nestjs/common';
import {
  ItemType,
  ServiceKey,
  TransportRequestStatus,
  VehicleCondition,
} from '@prisma/client';
import { CustomerRequestsService } from './customer-requests.service';

describe('vehicle request edits', () => {
  const prisma = {
    transportRequest: { findUnique: jest.fn(), update: jest.fn() },
  };
  function service(serviceKey: ServiceKey = ServiceKey.VEHICLE_TRANSPORT) {
    prisma.transportRequest.findUnique.mockResolvedValue({
      id: 'request',
      customerId: 'customer',
      status: TransportRequestStatus.DRAFT,
      pickupLatitude: 47,
      pickupLongitude: 7,
      dropoffLatitude: 48,
      dropoffLongitude: 8,
      service: { key: serviceKey },
    });
    prisma.transportRequest.update.mockResolvedValue({ id: 'request' });
    const instance = new CustomerRequestsService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    jest
      .spyOn(
        instance as unknown as { toResponseDto: (value: unknown) => unknown },
        'toResponseDto',
      )
      .mockImplementation((value) => value);
    return instance;
  }
  const payload = {
    customerId: 'customer',
    requestId: 'request',
    isImmediate: true,
    requiresLoadingHelp: false,
    vehicleBrand: 'VW',
    vehicleModel: 'Touran',
    vehicleManufactureYear: 2012,
    vehicleEstimatedWeightKg: 1549,
    vehicleCondition: VehicleCondition.NEEDS_WINCH,
    vehicleMobility: 'ROLLABLE',
    vehicleIssues: ['ACCIDENT', 'MISSING_WHEELS', 'CRANE'],
    vehicleTransmission: 'MANUAL',
    vehicleConditionNotes: 'Call at gate',
  };
  beforeEach(() => jest.resetAllMocks());
  it('accepts a vehicle without a generic item title and keeps the driver summary consistent', async () => {
    await service().updateScheduleAndItemDetails(payload);
    expect(prisma.transportRequest.update.mock.calls[0][0].data).toMatchObject({
      itemType: ItemType.VEHICLE,
      itemTitle: 'VW Touran',
      itemWeightKg: 1549,
      itemBrand: 'VW',
      vehicleMobility: 'ROLLABLE',
      vehicleIssues: ['ACCIDENT', 'MISSING_WHEELS', 'CRANE'],
      vehicleConditionNotes: 'Call at gate',
      requiresLoadingHelp: false,
    });
  });
  it('rejects changing a vehicle into goods', async () => {
    await expect(
      service().updateScheduleAndItemDetails({
        ...payload,
        itemType: ItemType.GOODS,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.transportRequest.update).not.toHaveBeenCalled();
  });
  it('still requires title and type for a non-vehicle service', async () => {
    await expect(
      service(ServiceKey.GOODS_TRANSPORT).updateScheduleAndItemDetails(payload),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
  it('updates pickup without writing schedule, photos, delivery or vehicle fields', async () => {
    await service().updatePickupLocation({
      customerId: 'customer',
      requestId: 'request',
      latitude: 46,
      longitude: 6,
      address: 'New pickup',
    });
    expect(prisma.transportRequest.update.mock.calls[0][0].data).toEqual({
      pickupCountryCode: null,
      originTenantId: null,
      currency: null,
      pickupLatitude: 46,
      pickupLongitude: 6,
      pickupAddress: 'New pickup',
      pickupPlaceId: null,
    });
  });
});
