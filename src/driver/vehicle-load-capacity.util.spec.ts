import {
  DayOfWeek,
  ItemType,
  ServiceKey,
  VehicleCargoType,
  VehicleType,
} from '@prisma/client';
import {
  canVehicleSupportRequestLoad,
  getCargoTypesForRequest,
  isCarCarrierVehicleType,
  isWorkingScheduleAvailableForDate,
  type DriverVehicleLoadCapacityLike,
} from './vehicle-load-capacity.util';

const vehicle: DriverVehicleLoadCapacityLike = {
  vehicleType: VehicleType.VAN,
  capacityKg: 100,
  lengthCm: 200,
  widthCm: 100,
  heightCm: 80,
  dimensionsAreStandard: false,
  allowedCargoTypes: [VehicleCargoType.GOODS],
  workingSchedule: [],
};
const request = {
  serviceKey: ServiceKey.GOODS_TRANSPORT,
  itemType: ItemType.GOODS,
  weightKg: 100,
  lengthCm: 200,
  widthCm: 100,
  heightCm: 80,
};

describe('vehicle load eligibility', () => {
  it.each([
    [ServiceKey.VEHICLE_TRANSPORT, ItemType.GOODS, [VehicleCargoType.VEHICLE]],
    [ServiceKey.MOTORCYCLE_TRANSPORT, null, [VehicleCargoType.MOTORCYCLE]],
    [
      ServiceKey.FURNITURE_TRANSPORT,
      null,
      [VehicleCargoType.FURNITURE, VehicleCargoType.GOODS],
    ],
    [ServiceKey.GOODS_TRANSPORT, null, [VehicleCargoType.GOODS]],
  ])(
    'uses service cargo requirements for %s',
    (serviceKey, itemType, expected) => {
      expect(getCargoTypesForRequest({ serviceKey, itemType })).toEqual(
        expected,
      );
    },
  );

  it('accepts dimensions and weight exactly at capacity', () => {
    expect(canVehicleSupportRequestLoad(vehicle, request)).toBe(true);
  });

  it.each(['weightKg', 'lengthCm', 'widthCm', 'heightCm'] as const)(
    'rejects %s exceeding capacity by one',
    (field) => {
      expect(
        canVehicleSupportRequestLoad(vehicle, {
          ...request,
          [field]: request[field] + 1,
        }),
      ).toBe(false);
    },
  );

  it('requires an allowed cargo type but treats an empty list as unrestricted', () => {
    expect(
      canVehicleSupportRequestLoad(vehicle, {
        ...request,
        serviceKey: ServiceKey.VEHICLE_TRANSPORT,
      }),
    ).toBe(false);
    expect(
      canVehicleSupportRequestLoad(
        { ...vehicle, allowedCargoTypes: [] },
        { ...request, serviceKey: ServiceKey.VEHICLE_TRANSPORT },
      ),
    ).toBe(true);
  });

  it('allows unknown size values and excludes carrier types from size checks', () => {
    expect(
      canVehicleSupportRequestLoad(
        { ...vehicle, capacityKg: null },
        { ...request, weightKg: 1000, lengthCm: null },
      ),
    ).toBe(true);
    expect(isCarCarrierVehicleType(VehicleType.FLATBED_OPEN)).toBe(true);
    expect(isCarCarrierVehicleType(VehicleType.VAN)).toBe(false);
    expect(
      canVehicleSupportRequestLoad(
        { ...vehicle, vehicleType: VehicleType.FLATBED_OPEN },
        { ...request, weightKg: 1000, lengthCm: 1000 },
      ),
    ).toBe(true);
  });
});

describe('vehicle working schedule', () => {
  const monday = new Date(2026, 8, 28, 9, 0);
  const schedule = [
    {
      dayOfWeek: DayOfWeek.MONDAY,
      isAvailable: true,
      timeRanges: [{ startTime: '09:00', endTime: '17:00' }],
    },
  ];

  it('allows an unscheduled request or a vehicle without a schedule', () => {
    expect(isWorkingScheduleAvailableForDate(schedule, null)).toBe(true);
    expect(isWorkingScheduleAvailableForDate([], monday)).toBe(true);
  });

  it('includes opening time and excludes closing time', () => {
    expect(isWorkingScheduleAvailableForDate(schedule, monday)).toBe(true);
    expect(
      isWorkingScheduleAvailableForDate(schedule, new Date(2026, 8, 28, 17, 0)),
    ).toBe(false);
  });

  it('rejects a missing day, an unavailable day, and an empty time range', () => {
    expect(
      isWorkingScheduleAvailableForDate(schedule, new Date(2026, 8, 29, 9, 0)),
    ).toBe(false);
    expect(
      isWorkingScheduleAvailableForDate(
        [{ ...schedule[0], isAvailable: false }],
        monday,
      ),
    ).toBe(false);
    expect(
      isWorkingScheduleAvailableForDate(
        [{ ...schedule[0], timeRanges: [] }],
        monday,
      ),
    ).toBe(false);
  });
});
