import type { Tenant } from '@prisma/client';

export const PUBLIC_TENANT_SELECT = {
  id: true,
  code: true,
  countryCode: true,
  name: true,
  defaultCurrency: true,
  timezone: true,
  defaultLocale: true,
} as const;

export type PublicTenant = Pick<Tenant, keyof typeof PUBLIC_TENANT_SELECT>;
export type TenantIdentity = {
  tenantId?: string | null;
  tenant?: (PublicTenant & { isActive: boolean }) | null;
};

export function publicTenant(
  tenant: TenantIdentity['tenant'],
): PublicTenant | null {
  if (!tenant) return null;
  const {
    id,
    code,
    countryCode,
    name,
    defaultCurrency,
    timezone,
    defaultLocale,
  } = tenant;
  return {
    id,
    code,
    countryCode,
    name,
    defaultCurrency,
    timezone,
    defaultLocale,
  };
}
