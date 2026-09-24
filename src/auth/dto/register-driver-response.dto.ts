import type { PublicTenant } from '../../tenants/tenant.types';
export interface RegisterDriverResponseDto {
  accessToken: string;
  user: {
    tenantId?: string | null;
    tenant?: PublicTenant | null;
    id: string;
    email: string;
    role: 'CUSTOMER' | 'DRIVER' | 'ADMIN';
  };
  driver: {
    id: string;
    nickname?: string | null;
    firstName: string;
    lastName: string;
    phone: string;
    countryCode: string | null;
    countryCodes: string[];
    city: string | null;
    cities: string[];
    status: string;
    isProfileCompleted: boolean;
  };
  nextStep: 'COMPLETE_PROFILE' | 'ADD_VEHICLE_DOCUMENTS';
}
