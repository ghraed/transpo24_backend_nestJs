import {
  DocumentStatus,
  DriverDocumentType,
  DriverVehicleReviewStatus,
  DriverStatus,
  ItemType,
  Prisma,
  ServiceKey,
  VehicleType,
} from '@prisma/client';
import {
  canVehicleSupportRequestLoad,
  DriverVehicleLoadCapacityLike,
  WorkingDayScheduleValue,
} from './vehicle-load-capacity.util';

export const LIVE_LOCATION_MAX_AGE_MS = 120_000;
export type CoveragePin = { city: string; latitude: number; longitude: number };
export type Coordinate = { latitude: number; longitude: number };

export const MATCHING_AVAILABILITY_SELECT = {
  isOnline: true,
  timezone: true,
  serviceRadiusKm: true,
  baseLatitude: true,
  baseLongitude: true,
  cityCoverage: true,
  liveLatitude: true,
  liveLongitude: true,
  liveLocationAt: true,
  acceptsImmediateRequests: true,
  acceptsScheduledRequests: true,
  schedule: {
    select: {
      dayOfWeek: true,
      isAvailable: true,
      startTime: true,
      endTime: true,
    },
  },
  driver: { select: { cities: true, status: true, isProfileCompleted: true } },
} satisfies Prisma.DriverAvailabilitySelect;
export type MatchingAvailability = Prisma.DriverAvailabilityGetPayload<{
  select: typeof MATCHING_AVAILABILITY_SELECT;
}>;
export type MatchingRequest = {
  status: string;
  assignedDriverId: string | null;
  acceptedOfferId: string | null;
  isImmediate: boolean;
  scheduledPickupAt: Date | null;
  pickupLatitude: number | null;
  pickupLongitude: number | null;
  service: { key: ServiceKey } | null;
  itemType: ItemType | null;
  itemWeightKg: number | null;
  itemLengthCm: number | null;
  itemWidthCm: number | null;
  itemHeightCm: number | null;
};
export type MatchingVehicle = Omit<
  DriverVehicleLoadCapacityLike,
  'workingSchedule'
> & { workingSchedule: Prisma.JsonValue | null };

export function validCoordinate(
  latitude: unknown,
  longitude: unknown,
): boolean {
  return (
    typeof latitude === 'number' &&
    Number.isFinite(latitude) &&
    Math.abs(latitude) <= 90 &&
    typeof longitude === 'number' &&
    Number.isFinite(longitude) &&
    Math.abs(longitude) <= 180
  );
}
export function parseCoveragePins(raw: unknown): CoveragePin[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((value: unknown): value is CoveragePin => {
    if (!value || typeof value !== 'object') return false;
    const pin = value as Record<string, unknown>;
    return (
      typeof pin.city === 'string' &&
      Boolean(pin.city.trim()) &&
      validCoordinate(pin.latitude, pin.longitude)
    );
  });
}
export function distanceKm(a: Coordinate, b: Coordinate): number {
  const rad = (n: number) => (n * Math.PI) / 180;
  const h =
    Math.sin(rad(b.latitude - a.latitude) / 2) ** 2 +
    Math.cos(rad(a.latitude)) *
      Math.cos(rad(b.latitude)) *
      Math.sin(rad(b.longitude - a.longitude) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, h))));
}
export function immediateReference(
  a: MatchingAvailability,
  now = new Date(),
): { source: 'GPS' | 'BASE' | 'NONE'; coordinate: Coordinate | null } {
  const age = a.liveLocationAt
    ? now.getTime() - a.liveLocationAt.getTime()
    : Infinity;
  if (
    age >= 0 &&
    age <= LIVE_LOCATION_MAX_AGE_MS &&
    validCoordinate(a.liveLatitude, a.liveLongitude)
  ) {
    return {
      source: 'GPS',
      coordinate: { latitude: a.liveLatitude!, longitude: a.liveLongitude! },
    };
  }
  if (validCoordinate(a.baseLatitude, a.baseLongitude)) {
    return {
      source: 'BASE',
      coordinate: { latitude: a.baseLatitude!, longitude: a.baseLongitude! },
    };
  }
  return { source: 'NONE', coordinate: null };
}
export function coverageDistance(
  request: Pick<
    MatchingRequest,
    'isImmediate' | 'pickupLatitude' | 'pickupLongitude'
  >,
  a: MatchingAvailability,
  now = new Date(),
): number | null {
  if (!validCoordinate(request.pickupLatitude, request.pickupLongitude))
    return null;
  const origin = immediateReference(a, now).coordinate;
  const pins = request.isImmediate
    ? origin
      ? [origin]
      : []
    : parseCoveragePins(a.cityCoverage).filter((pin) =>
        a.driver.cities.includes(pin.city),
      );
  if (!pins.length) return null;
  return Math.min(
    ...pins.map((pin) =>
      distanceKm(pin, {
        latitude: request.pickupLatitude!,
        longitude: request.pickupLongitude!,
      }),
    ),
  );
}

function localTime(
  date: Date,
  timezone: string,
): { day: string; time: string } | null {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      weekday: 'long',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(date);
    const get = (type: string) => parts.find((p) => p.type === type)?.value;
    return {
      day: get('weekday')!.toUpperCase(),
      time: `${get('hour')}:${get('minute')}`,
    };
  } catch {
    return null;
  }
}

export function parseWorkingSchedule(
  raw: Prisma.JsonValue | null,
): WorkingDayScheduleValue[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry) => {
    if (
      !entry ||
      typeof entry !== 'object' ||
      Array.isArray(entry) ||
      typeof entry.dayOfWeek !== 'string' ||
      typeof entry.isAvailable !== 'boolean' ||
      !Array.isArray(entry.timeRanges)
    )
      return [];
    return [
      {
        dayOfWeek: entry.dayOfWeek as WorkingDayScheduleValue['dayOfWeek'],
        isAvailable: entry.isAvailable,
        timeRanges: entry.timeRanges.flatMap((range) => {
          if (
            !range ||
            typeof range !== 'object' ||
            Array.isArray(range) ||
            typeof range.startTime !== 'string' ||
            typeof range.endTime !== 'string'
          )
            return [];
          return [{ startTime: range.startTime, endTime: range.endTime }];
        }),
      },
    ];
  });
}

export function hasCompatibleVehicle(
  request: MatchingRequest,
  vehicles: MatchingVehicle[],
  timezone: string,
  now = new Date(),
): boolean {
  if (!request.service || (!request.isImmediate && !request.scheduledPickupAt))
    return false;
  const local = localTime(
    request.isImmediate ? now : request.scheduledPickupAt!,
    timezone,
  );
  if (!local) return false;
  return vehicles.some((vehicle) => {
    if (!SERVICE_VEHICLES[request.service!.key]?.includes(vehicle.vehicleType))
      return false;
    const schedule = parseWorkingSchedule(vehicle.workingSchedule);
    if (schedule.length) {
      const day = schedule.find((d) => d.dayOfWeek === local.day);
      if (
        !day?.isAvailable ||
        !day.timeRanges.some(
          (r) => r.startTime <= local.time && local.time < r.endTime,
        )
      )
        return false;
    }
    return canVehicleSupportRequestLoad(
      { ...vehicle, workingSchedule: schedule },
      {
        serviceKey: request.service!.key,
        itemType: request.itemType,
        weightKg: request.itemWeightKg,
        lengthCm: request.itemLengthCm,
        widthCm: request.itemWidthCm,
        heightCm: request.itemHeightCm,
      },
    );
  });
}

export function isEligibleRequest(
  request: MatchingRequest,
  a: MatchingAvailability | null,
  vehicles: MatchingVehicle[],
  now = new Date(),
  requireOnline = true,
): boolean {
  if (
    !a ||
    (requireOnline && !a.isOnline) ||
    a.driver.status !== DriverStatus.APPROVED ||
    !a.driver.isProfileCompleted
  )
    return false;
  if (
    !['PENDING_QUOTES', 'QUOTED'].includes(request.status) ||
    request.assignedDriverId ||
    request.acceptedOfferId
  )
    return false;
  if (
    request.isImmediate
      ? !a.acceptsImmediateRequests
      : !a.acceptsScheduledRequests
  )
    return false;
  if (
    !request.isImmediate &&
    (!request.scheduledPickupAt || request.scheduledPickupAt < now)
  )
    return false;
  const local = localTime(
    request.isImmediate ? now : request.scheduledPickupAt!,
    a.timezone,
  );
  const day = a.schedule.find((d) => d.dayOfWeek === local?.day);
  if (
    !local ||
    !day?.isAvailable ||
    !day.startTime ||
    !day.endTime ||
    day.startTime > local.time ||
    local.time >= day.endTime
  )
    return false;
  const distance = coverageDistance(request, a, now);
  return (
    distance !== null &&
    a.serviceRadiusKm >= 1 &&
    a.serviceRadiusKm <= 500 &&
    distance <= a.serviceRadiusKm &&
    hasCompatibleVehicle(request, vehicles, a.timezone, now)
  );
}

const SERVICE_VEHICLES: Record<ServiceKey, VehicleType[]> = {
  VEHICLE_TRANSPORT: [
    'CAR_CARRIER',
    'FLATBED_TRUCK',
    'TOW_TRUCK',
    'FLATBED_OPEN',
    'FLATBED_ENCLOSED',
  ],
  MOTORCYCLE_TRANSPORT: [
    'MOTORCYCLE_TRAILER',
    'VAN',
    'PICKUP_TRUCK',
    'MOTORCYCLE',
    'PICKUP',
    'FLATBED_TRUCK',
    'FLATBED_OPEN',
    'FLATBED_ENCLOSED',
    'TOW_TRUCK',
    'CAR_CARRIER',
  ],
  GOODS_TRANSPORT: [
    'VAN',
    'BOX_TRUCK',
    'PICKUP_TRUCK',
    'SMALL_TRUCK',
    'MEDIUM_TRUCK',
    'PICKUP',
  ],
  FURNITURE_TRANSPORT: [
    'FURNITURE_TRUCK',
    'BOX_TRUCK',
    'VAN',
    'SMALL_TRUCK',
    'MEDIUM_TRUCK',
  ],
};

export const APPROVED_MATCHING_VEHICLE_WHERE = {
  isActive: true,
  status: DriverVehicleReviewStatus.APPROVED,
  AND: [
    {
      documents: {
        some: {
          type: DriverDocumentType.VEHICLE_FRONT_PHOTO,
          status: { not: DocumentStatus.REJECTED },
        },
      },
    },
    {
      documents: {
        some: {
          type: DriverDocumentType.VEHICLE_REAR_PHOTO,
          status: { not: DocumentStatus.REJECTED },
        },
      },
    },
    {
      documents: {
        some: {
          type: DriverDocumentType.VEHICLE_SIDE_PHOTO,
          status: { not: DocumentStatus.REJECTED },
        },
      },
    },
    {
      documents: {
        some: {
          type: DriverDocumentType.VEHICLE_LICENSE_PLATE_PHOTO,
          status: { not: DocumentStatus.REJECTED },
        },
      },
    },
    {
      documents: {
        some: {
          type: DriverDocumentType.VEHICLE_REGISTRATION_FRONT,
          status: { not: DocumentStatus.REJECTED },
        },
      },
    },
    {
      documents: {
        some: {
          type: DriverDocumentType.VEHICLE_REGISTRATION_BACK,
          status: { not: DocumentStatus.REJECTED },
        },
      },
    },
    {
      documents: {
        some: {
          type: DriverDocumentType.VEHICLE_INSURANCE_DOCUMENT,
          status: { not: DocumentStatus.REJECTED },
        },
      },
    },
  ],
} satisfies Prisma.DriverVehicleWhereInput;
