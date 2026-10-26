import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DriverAuthGuard } from '../auth/guards/driver-auth.guard';
import { TranslationModule } from '../translations/translations.module';
import { RoutesController, RoutesRateLimitGuard } from './routes.controller';
import { RoutesService } from './routes.service';

@Module({
  imports: [AuthModule, TranslationModule],
  controllers: [RoutesController],
  providers: [DriverAuthGuard, RoutesRateLimitGuard, RoutesService],
})
export class RoutesModule {}
