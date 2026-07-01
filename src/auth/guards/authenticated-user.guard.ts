import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';

import type { AuthenticatedUser } from '../auth.types';
import { AuthService } from '../auth.service';

@Injectable()
export class AuthenticatedUserGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  canActivate(context: ExecutionContext): boolean {
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

    (request as Request & { user?: AuthenticatedUser }).user = user;
    return true;
  }
}
