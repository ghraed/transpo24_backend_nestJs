import { VehicleType } from '@prisma/client';
import {
  normalizeDriverVehicleTypeInput,
  toDriverVehicleApiType,
} from './driver-vehicle-type.util';

describe('driver vehicle type mapping', () => {
  it.each([
    [' open_flatbed ', VehicleType.FLATBED_OPEN],
    ['car_carrier', VehicleType.FLATBED_ENCLOSED],
    ['BOX_TRUCK', VehicleType.MEDIUM_TRUCK],
    ['pickup_truck', VehicleType.PICKUP],
    ['motorcycle_trailer', VehicleType.MOTORCYCLE],
  ])('normalizes supported input %s', (input, expected) => {
    expect(normalizeDriverVehicleTypeInput(input)).toBe(expected);
  });

  it('leaves unknown and non-string input for validation to reject', () => {
    expect(normalizeDriverVehicleTypeInput('spaceship')).toBe('spaceship');
    expect(normalizeDriverVehicleTypeInput(null)).toBeNull();
    expect(normalizeDriverVehicleTypeInput(123)).toBe(123);
  });

  it.each([
    [VehicleType.FLATBED_TRUCK, 'OPEN_CAR_CARRIER'],
    [VehicleType.CAR_CARRIER, 'ENCLOSED_CARRIER'],
    [VehicleType.OTHER, 'SMALL_TRUCK'],
    [VehicleType.FURNITURE_TRUCK, 'MEDIUM_TRUCK'],
    [VehicleType.PICKUP_TRUCK, 'PICKUP'],
    [VehicleType.MOTORCYCLE_TRAILER, 'MOTORCYCLE'],
  ])('maps stored type %s to public type', (stored, expected) => {
    expect(toDriverVehicleApiType(stored)).toBe(expected);
  });
});
