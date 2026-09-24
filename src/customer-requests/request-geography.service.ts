import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { isISO31661Alpha2 } from 'class-validator';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { currencyForCountryCode } from '../common/currency/country-currency.util';

type Location = { latitude: number | null; longitude: number | null };
type GeocodeResponse = {
  status?: string;
  results?: Array<{
    address_components?: Array<{ short_name?: string; types?: string[] }>;
  }>;
};

export function normalizeRequestCountry(
  value: string | undefined,
): string | null {
  const code = value?.trim().toUpperCase();
  return code && isISO31661Alpha2(code) ? code : null;
}

@Injectable()
export class RequestGeographyService {
  constructor(private readonly prisma: PrismaService) {}

  async customerTenant(
    customerId: string,
    db: Prisma.TransactionClient = this.prisma,
  ) {
    const user = await db.user.findUnique({
      where: { id: customerId },
      select: { tenantId: true },
    });
    if (!user) throw new NotFoundException('Customer not found.');
    return user.tenantId;
  }

  async country(location: Location): Promise<string | null> {
    if (location.latitude === null || location.longitude === null) return null;
    if (
      !Number.isFinite(location.latitude) ||
      !Number.isFinite(location.longitude) ||
      Math.abs(location.latitude) > 90 ||
      Math.abs(location.longitude) > 180
    ) {
      throw new BadRequestException('Invalid request coordinates.');
    }
    const key = process.env.GOOGLE_MAPS_API_KEY?.trim();
    if (!key || key.startsWith('replace_with_')) {
      if (process.env.REQUEST_GEOGRAPHY_REQUIRED === 'true') this.unavailable();
      // Additive compatibility only: never guess a country from account/profile/address.
      return null;
    }
    let body: GeocodeResponse;
    try {
      const query = new URLSearchParams({
        latlng: `${location.latitude},${location.longitude}`,
        result_type: 'country',
        key,
      });
      const response = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?${query}`,
        { signal: AbortSignal.timeout(5000) },
      );
      if (!response.ok) this.unavailable();
      body = (await response.json()) as GeocodeResponse;
    } catch {
      this.unavailable();
    }
    if (body.status !== 'OK' && body.status !== 'ZERO_RESULTS')
      this.unavailable();
    const countries = new Set(
      (body.results ?? []).flatMap((result) =>
        (result.address_components ?? [])
          .filter((component) => component.types?.includes('country'))
          .map((component) => normalizeRequestCountry(component.short_name))
          .filter((code): code is string => code !== null),
      ),
    );
    if (countries.size !== 1) {
      throw new BadRequestException({
        code: 'REQUEST_COUNTRY_UNRESOLVED',
        message: 'Choose a location with a supported country.',
      });
    }
    return [...countries][0];
  }

  async pickup(location: Location, db: Prisma.TransactionClient = this.prisma) {
    const pickupCountryCode = await this.country(location);
    const origin = pickupCountryCode
      ? await db.tenant.findUnique({
          where: { countryCode: pickupCountryCode },
          select: { id: true },
        })
      : null;
    return {
      pickupCountryCode,
      originTenantId: origin?.id ?? null,
      currency: pickupCountryCode
        ? currencyForCountryCode(pickupCountryCode)
        : null,
    };
  }

  async route(
    customerId: string,
    pickup: Location,
    destination: Location,
    db: Prisma.TransactionClient = this.prisma,
  ) {
    const customerTenantId = await this.customerTenant(customerId, db);
    const [origin, destinationCountryCode] = await Promise.all([
      this.pickup(pickup, db),
      this.country(destination),
    ]);
    return { customerTenantId, ...origin, destinationCountryCode };
  }

  private unavailable(): never {
    throw new ServiceUnavailableException({
      code: 'REQUEST_GEOGRAPHY_UNAVAILABLE',
      message: 'Location verification is temporarily unavailable. Try again.',
    });
  }
}
