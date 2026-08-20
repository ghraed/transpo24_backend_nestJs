import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Request } from 'express';

import { AuthService } from '../auth.service';

@Injectable()
export class DriverAuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const authHeader = request.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException(
        'Missing or invalid authorization header.',
      );
    }

    const token = authHeader.slice('Bearer '.length).trim();
    const user = this.authService.getUserFromAccessToken(token);

    if (!user) {
      throw new UnauthorizedException('Invalid or expired token.');
    }

    if (!(await this.authService.isUserActive(user))) {
      throw new UnauthorizedException('This account is no longer active.');
    }

    if (user.role !== UserRole.DRIVER || !user.hasDriverProfile) {
      throw new ForbiddenException('Driver access is required.');
    }

    (
      request as Request & {
        user?: { id: string; email: string; name: string; role: UserRole };
      }
    ).user = user;

    return true;
  }
}
