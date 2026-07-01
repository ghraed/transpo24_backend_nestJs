import {
  DayOfWeek,
  ItemType,
  ServiceKey,
  VehicleCargoType,
  VehicleType,
} from '@prisma/client';

export interface WorkingTimeRangeValue {
  startTime: string;
  endTime: string;
}

export interface WorkingDayScheduleValue {
  dayOfWeek: DayOfWeek;
  isAvailable: boolean;
  timeRanges: WorkingTimeRangeValue[];
}

export interface DriverVehicleLoadCapacityLike {
  vehicleType: VehicleType;
  capacityKg: number | null;
  lengthCm: number | null;
  widthCm: number | null;
  heightCm: number | null;
  dimensionsAreStandard: boolean;
  allowedCargoTypes: VehicleCargoType[];
  workingSchedule: WorkingDayScheduleValue[];
}

export function isCarCarrierVehicleType(vehicleType: VehicleType): boolean {
  return (
    vehicleType === VehicleType.FLATBED_OPEN ||
    vehicleType === VehicleType.FLATBED_ENCLOSED ||
    vehicleType === VehicleType.FLATBED_TRUCK ||
    vehicleType === VehicleType.CAR_CARRIER
  );
}

export function getCargoTypesForRequest(input: {
  serviceKey: ServiceKey;
  itemType: ItemType | null;
}): VehicleCargoType[] {
  switch (input.serviceKey) {
    case ServiceKey.VEHICLE_TRANSPORT:
      return [VehicleCargoType.VEHICLE];
    case ServiceKey.MOTORCYCLE_TRANSPORT:
      return [VehicleCargoType.MOTORCYCLE];
    case ServiceKey.FURNITURE_TRANSPORT:
      return [VehicleCargoType.FURNITURE, VehicleCargoType.GOODS];
    case ServiceKey.GOODS_TRANSPORT:
      return [VehicleCargoType.GOODS];
    default:
      return input.itemType === ItemType.FURNITURE
        ? [VehicleCargoType.FURNITURE]
        : input.itemType === ItemType.MOTORCYCLE
          ? [VehicleCargoType.MOTORCYCLE]
          : input.itemType === ItemType.VEHICLE
            ? [VehicleCargoType.VEHICLE]
            : [VehicleCargoType.OTHER];
  }
}

export function canVehicleSupportRequestLoad(
  vehicle: DriverVehicleLoadCapacityLike,
  request: {
    serviceKey: ServiceKey;
    itemType: ItemType | null;
    weightKg: number | null;
    lengthCm: number | null;
    widthCm: number | null;
    heightCm: number | null;
  },
): boolean {
  const requiredCargoTypes = getCargoTypesForRequest({
    serviceKey: request.serviceKey,
    itemType: request.itemType,
  });

  if (
    vehicle.allowedCargoTypes.length > 0 &&
    !requiredCargoTypes.some((cargoType) =>
      vehicle.allowedCargoTypes.includes(cargoType),
    )
  ) {
    return false;
  }

  if (!isCarCarrierVehicleType(vehicle.vehicleType)) {
    if (
      request.weightKg !== null &&
      vehicle.capacityKg !== null &&
      vehicle.capacityKg < request.weightKg
    ) {
      return false;
    }
    if (
      request.lengthCm !== null &&
      vehicle.lengthCm !== null &&
      vehicle.lengthCm < request.lengthCm
    ) {
      return false;
    }
    if (
      request.widthCm !== null &&
      vehicle.widthCm !== null &&
      vehicle.widthCm < request.widthCm
    ) {
      return false;
    }
    if (
      request.heightCm !== null &&
      vehicle.heightCm !== null &&
      vehicle.heightCm < request.heightCm
    ) {
      return false;
    }
  }

  return true;
}

export function isWorkingScheduleAvailableForDate(
  schedule: WorkingDayScheduleValue[],
  date: Date | null,
): boolean {
  if (!date || schedule.length === 0) {
    return true;
  }

  const dayMap: DayOfWeek[] = [
    DayOfWeek.SUNDAY,
    DayOfWeek.MONDAY,
    DayOfWeek.TUESDAY,
    DayOfWeek.WEDNESDAY,
    DayOfWeek.THURSDAY,
    DayOfWeek.FRIDAY,
    DayOfWeek.SATURDAY,
  ];
  const dayOfWeek = dayMap[date.getDay()];
  const daySchedule = schedule.find((entry) => entry.dayOfWeek === dayOfWeek);
  if (!daySchedule || !daySchedule.isAvailable) {
    return false;
  }

  const timeValue = `${String(date.getHours()).padStart(2, '0')}:${String(
    date.getMinutes(),
  ).padStart(2, '0')}`;
  return daySchedule.timeRanges.some(
    (range) => range.startTime <= timeValue && timeValue < range.endTime,
  );
}
