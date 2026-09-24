import type { UserRole } from '@prisma/client';
import type { Request } from 'express';

export type AuthenticatedUser = {
  tenantId?: string | null;
  tenantCode?: string | null;
  id: string;
  name: string;
  email: string;
  role: UserRole;
  hasDriverProfile: boolean;
};

export type AuthenticatedRequest = Request & {
  user: AuthenticatedUser;
};
