import type { PublicTenant } from '../../tenants/tenant.types';
export interface PhoneAuthResponseDto {
  accessToken: string;
  refreshToken: string;
  user: {
    tenantId?: string | null;
    tenant?: PublicTenant | null;
    id: string;
    name: string;
    nickname: string | null;
    email: string;
    phoneNumber: string;
    countryCode: string | null;
    role: 'CUSTOMER';
  };
  isNewUser: boolean;
  profileCompleted: boolean;
}
