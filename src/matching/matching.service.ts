import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { isISO31661Alpha2 } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { RoutePolicyService } from '../route-policy/route-policy.service';
import {
  APPROVED_MATCHING_VEHICLE_WHERE,
  MATCHING_AVAILABILITY_SELECT,
  MatchingRequest,
  isEligibleRequest,
} from '../driver/request-eligibility';

export const MATCHING_DRIVER_SELECT = {
  id: true,
  userId: true,
  availability: { select: MATCHING_AVAILABILITY_SELECT },
  operationalCountries: {
    where: { status: 'APPROVED' },
    select: { countryCode: true, canPickup: true, canDropoff: true },
  },
  routePermissions: {
    where: { status: 'APPROVED' },
    select: { fromCountryCode: true, toCountryCode: true },
  },
  vehicles: {
    where: APPROVED_MATCHING_VEHICLE_WHERE,
    select: {
      vehicleType: true,
      capacityKg: true,
      lengthCm: true,
      widthCm: true,
      heightCm: true,
      dimensionsAreStandard: true,
      allowedCargoTypes: true,
      workingSchedule: true,
    },
  },
} satisfies Prisma.DriverProfileSelect;
type Driver = Prisma.DriverProfileGetPayload<{
  select: typeof MATCHING_DRIVER_SELECT;
}>;
type Request = MatchingRequest & {
  id: string;
  pickupCountryCode?: string | null;
  destinationCountryCode?: string | null;
};
const OPEN = {
  status: { in: ['PENDING_QUOTES', 'QUOTED'] },
  assignedDriverId: null,
  acceptedOfferId: null,
} satisfies Prisma.TransportRequestWhereInput;
const DRIVER = {
  status: 'APPROVED',
  isProfileCompleted: true,
  user: { deletedAt: null, role: 'DRIVER' },
} satisfies Prisma.DriverProfileWhereInput;

@Injectable()
export class MatchingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: RoutePolicyService = new RoutePolicyService(
      prisma,
    ),
  ) {}

  private countries(request: Request): request is Request & {
    pickupCountryCode: string;
    destinationCountryCode: string;
  } {
    return (
      !!request.pickupCountryCode &&
      !!request.destinationCountryCode &&
      isISO31661Alpha2(request.pickupCountryCode) &&
      isISO31661Alpha2(request.destinationCountryCode)
    );
  }

  private operational(request: Request, driver: Driver) {
    return (
      driver.operationalCountries.some(
        (c) => c.countryCode === request.pickupCountryCode && c.canPickup,
      ) &&
      driver.operationalCountries.some(
        (c) => c.countryCode === request.destinationCountryCode && c.canDropoff,
      ) &&
      driver.routePermissions.some(
        (r) =>
          r.fromCountryCode === request.pickupCountryCode &&
          r.toCountryCode === request.destinationCountryCode,
      )
    );
  }

  async allowed(request: Request, db: Prisma.TransactionClient = this.prisma) {
    return (
      this.countries(request) &&
      !!request.service &&
      ['PENDING_QUOTES', 'QUOTED'].includes(request.status) &&
      !request.assignedDriverId &&
      !request.acceptedOfferId &&
      !(await this.policy.isBlocked(
        {
          fromCountryCode: request.pickupCountryCode,
          toCountryCode: request.destinationCountryCode,
          transportType: request.service.key,
        },
        db,
      ))
    );
  }

  // Indexed operational approval predicates narrow the pool before loading vehicles/schedules.
  // Home tenant is deliberately absent: approved foreign drivers are eligible.
  async driversForRequest(
    request: Request,
    db: Prisma.TransactionClient = this.prisma,
  ) {
    if (!(await this.allowed(request, db))) return [];
    const drivers = await db.driverProfile.findMany({
      where: {
        ...DRIVER,
        availability: { is: { isOnline: true } },
        AND: [
          {
            operationalCountries: {
              some: {
                countryCode: request.pickupCountryCode!,
                status: 'APPROVED',
                canPickup: true,
              },
            },
          },
          {
            operationalCountries: {
              some: {
                countryCode: request.destinationCountryCode!,
                status: 'APPROVED',
                canDropoff: true,
              },
            },
          },
        ],
        routePermissions: {
          some: {
            fromCountryCode: request.pickupCountryCode!,
            toCountryCode: request.destinationCountryCode!,
            status: 'APPROVED',
          },
        },
        offers: { none: { requestId: request.id } },
        requestAlerts: {
          none: {
            requestId: request.id,
            status: { in: ['IGNORED', 'ACCEPTED'] },
          },
        },
        vehicles: { some: APPROVED_MATCHING_VEHICLE_WHERE },
      },
      select: MATCHING_DRIVER_SELECT,
    });
    return drivers.filter(
      (driver) =>
        this.operational(request, driver) &&
        isEligibleRequest(request, driver.availability, driver.vehicles),
    );
  }

  async activate(
    requestId: string,
    driverId: string,
    db: Prisma.TransactionClient = this.prisma,
  ) {
    return db.driverRequestAlert.upsert({
      where: { requestId_driverId: { requestId, driverId } },
      create: { requestId, driverId, isActive: true, matchedAt: new Date() },
      update: { isActive: true, matchedAt: new Date() },
    });
  }

  // Driver refresh loads only approved directions, in bounded pages, with one policy read per page.
  async refreshDriver(driverId: string): Promise<string[]> {
    const newlyActive: string[] = [];
    const driver = await this.prisma.driverProfile.findFirst({
      where: { id: driverId, ...DRIVER },
      select: MATCHING_DRIVER_SELECT,
    });
    if (!driver?.availability?.isOnline || !driver.routePermissions.length)
      return newlyActive;
    const directions = driver.routePermissions.filter((r) =>
      this.operational(
        {
          pickupCountryCode: r.fromCountryCode,
          destinationCountryCode: r.toCountryCode,
        } as Request,
        driver,
      ),
    );
    if (!directions.length) return newlyActive;
    let cursor: string | undefined;
    do {
      const requests = await this.prisma.transportRequest.findMany({
        where: {
          ...OPEN,
          OR: directions.map((r) => ({
            pickupCountryCode: r.fromCountryCode,
            destinationCountryCode: r.toCountryCode,
          })),
          offers: { none: { driverId } },
          driverAlerts: {
            none: {
              driverId,
              OR: [
                { isActive: true },
                { status: { in: ['IGNORED', 'ACCEPTED', 'EXPIRED'] } },
              ],
            },
          },
        },
        include: {
          service: true,
          driverAlerts: { where: { driverId }, select: { isActive: true } },
        },
        orderBy: { id: 'asc' },
        take: 100,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });
      if (!requests.length) break;
      const blocks = await this.prisma.routeBlock.findMany({
        where: { isActive: true, OR: directions },
        select: {
          fromCountryCode: true,
          toCountryCode: true,
          transportType: true,
        },
      });
      const now = new Date();
      for (const request of requests) {
        if (
          !request.service ||
          blocks.some(
            (b) =>
              b.fromCountryCode === request.pickupCountryCode &&
              b.toCountryCode === request.destinationCountryCode &&
              (!b.transportType || b.transportType === request.service?.key),
          )
        )
          continue;
        if (
          isEligibleRequest(request, driver.availability, driver.vehicles, now)
        ) {
          await this.activate(request.id, driverId);
          if (!request.driverAlerts.some((a) => a.isActive))
            newlyActive.push(request.id);
        }
      }
      cursor =
        requests.length === 100 ? requests[requests.length - 1].id : undefined;
    } while (cursor);
    return newlyActive;
  }

  async discoverable(
    requests: Request[],
    driverId: string,
    db: Prisma.TransactionClient = this.prisma,
  ) {
    if (!requests.length) return new Set<string>();
    const driver = await db.driverProfile.findFirst({
      where: { id: driverId, ...DRIVER },
      select: MATCHING_DRIVER_SELECT,
    });
    if (!driver) return new Set<string>();
    const candidates = await db.driverRequestAlert.findMany({
      where: {
        driverId,
        isActive: true,
        requestId: { in: requests.map((r) => r.id) },
      },
      select: { requestId: true },
    });
    const active = new Set(candidates.map((c) => c.requestId));
    const routes = requests
      .filter((r) => this.countries(r))
      .map((r) => ({
        fromCountryCode: r.pickupCountryCode,
        toCountryCode: r.destinationCountryCode,
      }));
    if (!routes.length) return new Set<string>();
    const blocks = await db.routeBlock.findMany({
      where: { isActive: true, OR: routes },
      select: {
        fromCountryCode: true,
        toCountryCode: true,
        transportType: true,
      },
    });
    const now = new Date();
    return new Set(
      requests
        .filter(
          (request) =>
            active.has(request.id) &&
            this.countries(request) &&
            this.operational(request, driver) &&
            !blocks.some(
              (b) =>
                b.fromCountryCode === request.pickupCountryCode &&
                b.toCountryCode === request.destinationCountryCode &&
                (!b.transportType || b.transportType === request.service?.key),
            ) &&
            isEligibleRequest(
              request,
              driver.availability,
              driver.vehicles,
              now,
              false,
            ),
        )
        .map((r) => r.id),
    );
  }

  async assertCanOffer(
    request: Request,
    driverId: string,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<void> {
    // Recheck current policy in the caller's offer transaction.
    if (request.service) {
      await this.policy.assertAllowed(
        {
          fromCountryCode: request.pickupCountryCode ?? null,
          toCountryCode: request.destinationCountryCode ?? null,
          transportType: request.service.key,
        },
        db,
      );
    }
    if (!(await this.canDiscover(request, driverId, db))) {
      throw new ForbiddenException({
        code: 'REQUEST_ACCESS_DENIED',
        message: 'This request is no longer available to you.',
      });
    }
  }

  // Reload after candidate commit: a queued notification is not authorization.
  async canNotify(requestId: string, driverId: string): Promise<boolean> {
    const request = await this.prisma.transportRequest.findUnique({
      where: { id: requestId },
      include: {
        service: true,
        offers: { where: { driverId }, select: { id: true } },
        driverAlerts: {
          where: { driverId, isActive: true, status: { in: ['NEW', 'SEEN'] } },
          select: { id: true },
        },
      },
    });
    return (
      !!request &&
      !request.offers.length &&
      !!request.driverAlerts.length &&
      this.canDiscover(request, driverId)
    );
  }

  async canDiscover(
    request: Request,
    driverId: string,
    db: Prisma.TransactionClient = this.prisma,
  ) {
    return (await this.discoverable([request], driverId, db)).has(request.id);
  }
}
