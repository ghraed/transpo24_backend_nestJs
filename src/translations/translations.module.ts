import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { AuthenticatedUserGuard } from '../auth/guards/authenticated-user.guard';
import { GoogleTranslateProvider } from './google-translate.provider';
import { TranslationCacheService } from './translation-cache.service';
import { TranslationRateLimitGuard } from './translation-rate-limit.guard';
import { TranslationController } from './translations.controller';
import { TranslationService } from './translations.service';

@Module({
  imports: [AuthModule],
  controllers: [TranslationController],
  providers: [
    AuthenticatedUserGuard,
    GoogleTranslateProvider,
    TranslationCacheService,
    TranslationRateLimitGuard,
    TranslationService,
  ],
  exports: [TranslationService],
})
export class TranslationModule {}
