import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PUBLIC_TENANT_SELECT, type TenantIdentity } from './tenant.types';

@Injectable()
export class TenantsService {
  constructor(private readonly prisma: PrismaService) {}

  get authRequired(): boolean {
    return process.env.TENANT_AUTH_REQUIRED === 'true';
  }

  listPublic() {
    return this.prisma.tenant.findMany({
      where: { isActive: true },
      select: PUBLIC_TENANT_SELECT,
      orderBy: { code: 'asc' },
    });
  }

  async resolveMarket(marketCode: string) {
    const code = marketCode.trim().toUpperCase();
    if (!/^[A-Z][A-Z0-9_-]{1,31}$/.test(code)) {
      throw new BadRequestException({
        code: 'TENANT_NOT_FOUND',
        message: 'Choose a valid Transpo24 market.',
      });
    }
    const tenant = await this.prisma.tenant.findUnique({ where: { code } });
    if (!tenant) {
      throw new BadRequestException({
        code: 'TENANT_NOT_FOUND',
        message: 'This Transpo24 market does not exist.',
      });
    }
    if (!tenant.isActive) this.inactive();
    return tenant;
  }

  // Compatibility is explicit: never infer ownership from phone, GPS or profile.
  async registrationTenant(marketCode?: string) {
    if (marketCode !== undefined) return this.resolveMarket(marketCode);
    if (this.authRequired) this.marketRequired();
    const fallback = process.env.LEGACY_REGISTRATION_MARKET_CODE?.trim();
    return fallback ? this.resolveMarket(fallback) : null;
  }

  async assertLoginMarket(
    user: TenantIdentity & { role: UserRole },
    marketCode?: string,
  ): Promise<void> {
    // The existing ADMIN role is global; it has no country-market login selector.
    if (user.role === UserRole.ADMIN && marketCode === undefined) return;
    if (marketCode !== undefined) {
      const selected = await this.resolveMarket(marketCode);
      if (!user.tenantId) this.assignmentRequired();
      if (selected.id !== user.tenantId) {
        throw new ForbiddenException({
          code: 'TENANT_MISMATCH',
          message: 'This account belongs to another Transpo24 market.',
        });
      }
    } else if (this.authRequired) {
      this.marketRequired();
    }
    this.assertIdentity(user);
  }

  assertIdentity(
    user: TenantIdentity & { role: UserRole },
    boundTenantId?: string | null,
  ): void {
    if (boundTenantId && boundTenantId !== user.tenantId) {
      throw new ForbiddenException({
        code: 'TENANT_MISMATCH',
        message: 'The session market no longer matches this account.',
      });
    }
    if (user.tenantId) {
      if (
        !user.tenant ||
        user.tenant.id !== user.tenantId ||
        !user.tenant.isActive
      )
        this.inactive();
    } else if (this.authRequired && user.role !== UserRole.ADMIN) {
      this.assignmentRequired();
    }
  }

  private inactive(): never {
    throw new ForbiddenException({
      code: 'TENANT_INACTIVE',
      message: 'This Transpo24 market is currently unavailable.',
    });
  }
  private marketRequired(): never {
    throw new BadRequestException({
      code: 'MARKET_REQUIRED',
      message: 'Choose your Transpo24 market to continue.',
    });
  }
  private assignmentRequired(): never {
    throw new ForbiddenException({
      code: 'TENANT_ASSIGNMENT_REQUIRED',
      message: 'This account needs a home market assignment. Contact support.',
    });
  }
}
