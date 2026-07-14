import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';

import type { AuthenticatedRequest } from '../auth/auth.types';
import { TranslationCacheService } from './translation-cache.service';

@Injectable()
export class TranslationRateLimitGuard implements CanActivate {
  constructor(private readonly cacheService: TranslationCacheService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const authenticatedRequest = request as Partial<AuthenticatedRequest>;
    const identifier =
      authenticatedRequest.user?.id || request.ip || 'unknown-client';
    const key = 'translation-rate-limit:' + identifier;
    const currentCount = await this.cacheService.incrementRateLimitCounter(
      key,
      this.cacheService.rateLimitWindowSeconds,
    );

    if (currentCount > this.cacheService.rateLimitMaxRequests) {
      throw new HttpException(
        'Too many translation requests.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }
}
