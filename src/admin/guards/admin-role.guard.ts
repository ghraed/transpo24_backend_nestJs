import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import { UserRole } from '@prisma/client';

import type { AuthenticatedUser } from '../../auth/auth.types';

@Injectable()
export class AdminRoleGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const user = (request as Request & { user?: AuthenticatedUser }).user;

    if (!user || user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Admin access is required.');
    }

    return true;
  }
}
