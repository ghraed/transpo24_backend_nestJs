import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { AuthenticatedRequest } from '../../auth/auth.types';
import { TranslationCacheService } from '../../translations/translation-cache.service';
import { scanError } from './registration.errors';

@Injectable()
export class RegistrationRateLimitGuard implements CanActivate {
  constructor(private readonly counters: TranslationCacheService) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const { user } = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!user?.id) throw scanError('REGISTRATION_AUTH_REQUIRED', 401);
    const [minute, hour] = await Promise.all([
      this.counters.incrementRateLimitCounter(
        `registration:minute:${user.id}`,
        60,
      ),
      this.counters.incrementRateLimitCounter(
        `registration:hour:${user.id}`,
        3600,
      ),
    ]);
    if (minute > 5 || hour > 20)
      throw scanError('REGISTRATION_RATE_LIMIT', 429);
    return true;
  }
}
