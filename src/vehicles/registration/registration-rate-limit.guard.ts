import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { AuthenticatedRequest } from '../../auth/auth.types';
import { RegistrationJobStore } from './registration-job.store';
import { scanError } from './registration.errors';

@Injectable()
export class RegistrationRateLimitGuard implements CanActivate {
  constructor(private readonly counters: RegistrationJobStore) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const { user } = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!user?.id) throw scanError('REGISTRATION_AUTH_REQUIRED', 401);
    await Promise.all([
      this.counters.limit(user.id, 'minute', 5, 60),
      this.counters.limit(user.id, 'hour', 20, 3600),
    ]);
    return true;
  }
}
