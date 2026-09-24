import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { isISO31661Alpha2 } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import {
  CountryCoverageDto,
  RoutePermissionDto,
  ReviewCountryDto,
  ReviewRouteDto,
} from './coverage.dto';

@Injectable()
export class DriverCoverageService {
  constructor(private readonly prisma: PrismaService) {}

  async driverForUser(userId: string) {
    const driver = await this.prisma.driverProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!driver) throw new NotFoundException('Driver profile not found.');
    return driver.id;
  }

  private async driver(
    driverId: string,
    db: Prisma.TransactionClient = this.prisma,
  ) {
    const driver = await db.driverProfile.findUnique({
      where: { id: driverId },
      include: { user: { select: { tenant: true } } },
    });
    if (!driver) throw new NotFoundException('Driver profile not found.');
    return driver;
  }

  private country(value: string) {
    const code = typeof value === 'string' ? value.trim().toUpperCase() : '';
    if (!isISO31661Alpha2(code))
      throw new BadRequestException('Invalid country code.');
    return code;
  }

  async list(driverId: string) {
    await this.driver(driverId);
    const [countries, routes] = await Promise.all([
      this.prisma.driverOperationalCountry.findMany({
        where: { driverId },
        orderBy: { countryCode: 'asc' },
      }),
      this.prisma.driverRoutePermission.findMany({
        where: { driverId },
        orderBy: [{ fromCountryCode: 'asc' }, { toCountryCode: 'asc' }],
      }),
    ]);
    return { countries, routes };
  }

  async requestCountry(driverId: string, input: CountryCoverageDto) {
    await this.driver(driverId);
    const countryCode = this.country(input.countryCode);
    // A repeated request cannot overwrite an admin decision or expand approved permissions.
    return this.prisma.driverOperationalCountry.upsert({
      where: { driverId_countryCode: { driverId, countryCode } },
      update: {},
      create: {
        driverId,
        countryCode,
        canPickup: input.canPickup,
        canDropoff: input.canDropoff,
        status: 'PENDING',
      },
    });
  }

  async requestRoute(driverId: string, input: RoutePermissionDto) {
    await this.driver(driverId);
    const fromCountryCode = this.country(input.fromCountryCode);
    const toCountryCode = this.country(input.toCountryCode);
    return this.prisma.driverRoutePermission.upsert({
      where: {
        driverId_fromCountryCode_toCountryCode: {
          driverId,
          fromCountryCode,
          toCountryCode,
        },
      },
      update: {},
      create: { driverId, fromCountryCode, toCountryCode, status: 'PENDING' },
    });
  }

  async reviewCountry(
    driverId: string,
    input: ReviewCountryDto,
    actorId: string,
  ) {
    await this.driver(driverId);
    const countryCode = this.country(input.countryCode);
    const data = {
      canPickup: input.canPickup,
      canDropoff: input.canDropoff,
      status: input.status,
      reviewedByAdminId: actorId,
      reviewedAt: new Date(),
    };
    return this.prisma.driverOperationalCountry.upsert({
      where: { driverId_countryCode: { driverId, countryCode } },
      create: { driverId, countryCode, ...data },
      update: data,
    });
  }

  async reviewRoute(driverId: string, input: ReviewRouteDto, actorId: string) {
    await this.driver(driverId);
    const fromCountryCode = this.country(input.fromCountryCode);
    const toCountryCode = this.country(input.toCountryCode);
    const data = {
      status: input.status,
      reviewedByAdminId: actorId,
      reviewedAt: new Date(),
    };
    return this.prisma.driverRoutePermission.upsert({
      where: {
        driverId_fromCountryCode_toCountryCode: {
          driverId,
          fromCountryCode,
          toCountryCode,
        },
      },
      create: { driverId, fromCountryCode, toCountryCode, ...data },
      update: data,
    });
  }

  // Explicit admin action after reviewed tenant assignment. Initialization grants nothing.
  async initializeHome(driverId: string) {
    return this.prisma.$transaction(async (db) => {
      const driver = await this.driver(driverId, db);
      const tenant = driver.user.tenant;
      if (!tenant)
        throw new BadRequestException('Assign a reviewed home tenant first.');
      const countryCode = this.country(tenant.countryCode);
      const country = await db.driverOperationalCountry.upsert({
        where: { driverId_countryCode: { driverId, countryCode } },
        update: {},
        create: { driverId, countryCode, status: 'PENDING' },
      });
      const route = await db.driverRoutePermission.upsert({
        where: {
          driverId_fromCountryCode_toCountryCode: {
            driverId,
            fromCountryCode: countryCode,
            toCountryCode: countryCode,
          },
        },
        update: {},
        create: {
          driverId,
          fromCountryCode: countryCode,
          toCountryCode: countryCode,
          status: 'PENDING',
        },
      });
      return { country, route };
    });
  }

  // M7 composes this with driver state, platform policy, vehicle, radius and schedule checks.
  async assertApproved(
    driverId: string,
    from: string,
    to: string,
    db: Prisma.TransactionClient = this.prisma,
  ) {
    const fromCountryCode = this.country(from);
    const toCountryCode = this.country(to);
    const countries = await db.driverOperationalCountry.findMany({
      where: {
        driverId,
        countryCode: { in: [fromCountryCode, toCountryCode] },
        status: 'APPROVED',
      },
    });
    if (
      !countries.some(
        (c) => c.countryCode === fromCountryCode && c.canPickup,
      ) ||
      !countries.some((c) => c.countryCode === toCountryCode && c.canDropoff)
    ) {
      throw new ForbiddenException({
        code: 'DRIVER_COUNTRY_NOT_APPROVED',
        message: 'Driver country coverage is not approved.',
      });
    }
    const route = await db.driverRoutePermission.findUnique({
      where: {
        driverId_fromCountryCode_toCountryCode: {
          driverId,
          fromCountryCode,
          toCountryCode,
        },
      },
    });
    if (route?.status !== 'APPROVED')
      throw new ForbiddenException({
        code: 'DRIVER_ROUTE_NOT_APPROVED',
        message: 'Driver route is not approved.',
      });
  }
}
