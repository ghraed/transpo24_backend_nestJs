import type { PublicTenant } from '../../tenants/tenant.types';
export interface RegisterResponseDto {
  message: string;
  user: {
    tenantId?: string | null;
    tenant?: PublicTenant | null;
    id: string;
    name: string;
    email: string;
    role: 'CUSTOMER' | 'DRIVER' | 'ADMIN';
  };
}
