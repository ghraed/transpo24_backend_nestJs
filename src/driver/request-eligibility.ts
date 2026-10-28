import { find as findTimezones } from 'geo-tz';
import { shouldDeferTransportPayment } from '../customer-requests/furniture-reservation-policy';
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
  scheduleTimeZone?: string | null;
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
): { source: 'GPS' | 'NONE'; coordinate: Coordinate | null } {
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
  if (!origin) return null;
  return distanceKm(origin, {
    latitude: request.pickupLatitude!,
    longitude: request.pickupLongitude!,
  });
}

function localTime(
  date: Date,
  coordinate: Coordinate,
): { day: string; time: string } | null {
  try {
    const timezone = findTimezones(
      coordinate.latitude,
      coordinate.longitude,
    )[0];
    if (!timezone) return null;
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
  local: { day: string; time: string },
): boolean {
  if (!request.service) return false;
  return vehicles.some((vehicle) => {
    // Explicit cargo selections take precedence over legacy vehicle categories.
    // Older profiles without selections retain their original service defaults.
    if (
      vehicle.allowedCargoTypes.length === 0 &&
      !SERVICE_VEHICLES[request.service!.key]?.includes(vehicle.vehicleType)
    )
      return false;
    const schedule = parseWorkingSchedule(vehicle.workingSchedule);
    if (schedule.length) {
      const day = schedule.find((entry) => entry.dayOfWeek === local.day);
      if (
        !day?.isAvailable ||
        !day.timeRanges.some(
          (range) =>
            range.startTime <= local.time && local.time < range.endTime,
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

export const REQUEST_INELIGIBILITY_MESSAGES = {
  AVAILABILITY_REQUIRED: 'Driver availability must be configured first.',
  DRIVER_UNAVAILABLE:
    'Your driver account must be approved and available to receive requests.',
  REQUEST_CLOSED: 'Request is no longer available for quotes.',
  IMMEDIATE_DISABLED:
    'Immediate requests are disabled in your availability settings.',
  SCHEDULED_DISABLED:
    'Scheduled requests are disabled in your availability settings.',
  PICKUP_TIME_PASSED: 'The scheduled pickup time has passed.',
  LOCATION_UNAVAILABLE:
    'Go online and enable location access to refresh your GPS location.',
  OUTSIDE_RADIUS:
    'This pickup is outside your service radius. Review your availability settings.',
  OUTSIDE_WORKING_HOURS:
    'This pickup is outside your working hours. Review your availability settings.',
  NO_COMPATIBLE_VEHICLE:
    'No approved vehicle matches this request, its load, and pickup working hours.',
} as const;
export type RequestIneligibilityReason =
  keyof typeof REQUEST_INELIGIBILITY_MESSAGES;

export function isEligibleRequest(
  ...args: Parameters<typeof requestIneligibilityReason>
): boolean {
  return requestIneligibilityReason(...args) === null;
}

// The map's radius limits notifications, not manually initiated offers.
// Keep GPS-local working hours, request preferences and vehicle checks.
export function offerIneligibilityReason(
  request: MatchingRequest,
  availability: MatchingAvailability | null,
  vehicles: MatchingVehicle[],
  now = new Date(),
): RequestIneligibilityReason | null {
  return requestIneligibilityReason(
    request,
    availability,
    vehicles,
    now,
    false,
    undefined,
    false,
  );
}

export function requestIneligibilityReason(
  request: MatchingRequest,
  a: MatchingAvailability | null,
  vehicles: MatchingVehicle[],
  now = new Date(),
  requireOnline = true,
  routeCoverage?: { distanceKm: number; radiusKm: number; origin: Coordinate },
  enforceRadius = true,
): RequestIneligibilityReason | null {
  if (!a) return 'AVAILABILITY_REQUIRED';
  if (
    (requireOnline &&
      !a.isOnline &&
      !shouldDeferTransportPayment(
        request.service?.key ?? '',
        request.scheduledPickupAt,
        request.scheduleTimeZone ?? null,
        now,
      )) ||
    a.driver.status !== DriverStatus.APPROVED ||
    !a.driver.isProfileCompleted
  )
    return 'DRIVER_UNAVAILABLE';
  if (
    !['PENDING_QUOTES', 'QUOTED'].includes(request.status) ||
    request.assignedDriverId ||
    request.acceptedOfferId
  )
    return 'REQUEST_CLOSED';
  if (
    request.isImmediate
      ? !a.acceptsImmediateRequests
      : !a.acceptsScheduledRequests
  )
    return request.isImmediate ? 'IMMEDIATE_DISABLED' : 'SCHEDULED_DISABLED';
  if (
    !request.isImmediate &&
    (!request.scheduledPickupAt || request.scheduledPickupAt < now)
  )
    return 'PICKUP_TIME_PASSED';
  const distance =
    routeCoverage?.distanceKm ?? coverageDistance(request, a, now);
  const radius = routeCoverage?.radiusKm ?? a.serviceRadiusKm;
  if (distance === null) return 'LOCATION_UNAVAILABLE';
  if (enforceRadius && (radius < 1 || radius > 500 || distance > radius))
    return 'OUTSIDE_RADIUS';

  // Interpret working hours where the driver currently is, never in the
  // customer's timezone or the driver's legacy saved timezone.
  const local = localTime(
    request.isImmediate ? now : request.scheduledPickupAt!,
    routeCoverage?.origin ?? {
      latitude: a.liveLatitude!,
      longitude: a.liveLongitude!,
    },
  );
  if (!local) return 'LOCATION_UNAVAILABLE';
  const day = a.schedule.find((entry) => entry.dayOfWeek === local.day);
  if (
    !day?.isAvailable ||
    !day.startTime ||
    !day.endTime ||
    day.startTime > local.time ||
    local.time >= day.endTime
  )
    return 'OUTSIDE_WORKING_HOURS';
  return hasCompatibleVehicle(request, vehicles, local)
    ? null
    : 'NO_COMPATIBLE_VEHICLE';
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
