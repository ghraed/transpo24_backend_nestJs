import { VehicleType } from '@prisma/client';

export type DriverVehicleApiType =
  | 'OPEN_CAR_CARRIER'
  | 'ENCLOSED_CARRIER'
  | 'SMALL_TRUCK'
  | 'MEDIUM_TRUCK'
  | 'PICKUP'
  | 'VAN'
  | 'TOW_TRUCK'
  | 'MOTORCYCLE';

const DRIVER_VEHICLE_INPUT_ALIASES: Record<string, VehicleType> = {
  OPEN_CAR_CARRIER: VehicleType.FLATBED_OPEN,
  OPEN_FLATBED: VehicleType.FLATBED_OPEN,
  FLATBED_OPEN: VehicleType.FLATBED_OPEN,
  FLATBED_TRUCK: VehicleType.FLATBED_OPEN,
  ENCLOSED_CARRIER: VehicleType.FLATBED_ENCLOSED,
  FLATBED_ENCLOSED: VehicleType.FLATBED_ENCLOSED,
  CAR_CARRIER: VehicleType.FLATBED_ENCLOSED,
  SMALL_TRUCK: VehicleType.SMALL_TRUCK,
  MEDIUM_TRUCK: VehicleType.MEDIUM_TRUCK,
  BOX_TRUCK: VehicleType.MEDIUM_TRUCK,
  FURNITURE_TRUCK: VehicleType.MEDIUM_TRUCK,
  PICKUP: VehicleType.PICKUP,
  PICKUP_TRUCK: VehicleType.PICKUP,
  VAN: VehicleType.VAN,
  TOW_TRUCK: VehicleType.TOW_TRUCK,
  MOTORCYCLE: VehicleType.MOTORCYCLE,
  MOTORCYCLE_TRAILER: VehicleType.MOTORCYCLE,
  OTHER: VehicleType.SMALL_TRUCK,
};

export function normalizeDriverVehicleTypeInput(
  value: unknown,
): unknown {
  if (typeof value !== 'string') {
    return value;
  }

  const normalizedValue = value.trim().toUpperCase();
  return DRIVER_VEHICLE_INPUT_ALIASES[normalizedValue] ?? value;
}

export function toDriverVehicleApiType(
  vehicleType: VehicleType,
): DriverVehicleApiType {
  switch (vehicleType) {
    case VehicleType.FLATBED_OPEN:
    case VehicleType.FLATBED_TRUCK:
      return 'OPEN_CAR_CARRIER';
    case VehicleType.FLATBED_ENCLOSED:
    case VehicleType.CAR_CARRIER:
      return 'ENCLOSED_CARRIER';
    case VehicleType.SMALL_TRUCK:
    case VehicleType.OTHER:
      return 'SMALL_TRUCK';
    case VehicleType.MEDIUM_TRUCK:
    case VehicleType.BOX_TRUCK:
    case VehicleType.FURNITURE_TRUCK:
      return 'MEDIUM_TRUCK';
    case VehicleType.PICKUP:
    case VehicleType.PICKUP_TRUCK:
      return 'PICKUP';
    case VehicleType.VAN:
      return 'VAN';
    case VehicleType.TOW_TRUCK:
      return 'TOW_TRUCK';
    case VehicleType.MOTORCYCLE:
    case VehicleType.MOTORCYCLE_TRAILER:
      return 'MOTORCYCLE';
  }
}
