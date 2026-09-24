import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Prisma, ServiceKey } from '@prisma/client';
import { isISO31661Alpha2 } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';

type Route = {
  fromCountryCode: string | null;
  toCountryCode: string | null;
  transportType: ServiceKey;
};

@Injectable()
export class RoutePolicyService {
  constructor(private readonly prisma: PrismaService) {}

  async isBlocked(
    route: Route,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<boolean> {
    return (await this.findBlock(route, db)) !== null;
  }

  async findBlock(route: Route, db: Prisma.TransactionClient = this.prisma) {
    const fromCountryCode = this.country(route.fromCountryCode);
    const toCountryCode = this.country(route.toCountryCode);
    if (!Object.values(ServiceKey).includes(route.transportType)) {
      throw new BadRequestException('Invalid transport type.');
    }
    // Read current policy every time; no stale cache and no allow-list fallback.
    return db.routeBlock.findFirst({
      where: {
        fromCountryCode,
        toCountryCode,
        isActive: true,
        OR: [{ transportType: null }, { transportType: route.transportType }],
      },
      select: { id: true, reason: true },
      orderBy: [
        { transportType: { sort: 'asc', nulls: 'first' } },
        { id: 'asc' },
      ],
    });
  }

  async assertAllowed(
    route: Route,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<void> {
    if (await this.isBlocked(route, db)) {
      throw new ForbiddenException({
        code: 'ROUTE_BLOCKED',
        message: 'Transport on this route is currently unavailable.',
      });
    }
  }

  private country(value: string | null): string {
    const code = value?.trim().toUpperCase();
    if (!code || !isISO31661Alpha2(code)) {
      throw new BadRequestException({
        code: 'REQUEST_COUNTRY_UNRESOLVED',
        message: 'Choose a location with a supported country.',
      });
    }
    return code;
  }
}
