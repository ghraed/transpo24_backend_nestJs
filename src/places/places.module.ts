import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DriverAuthGuard } from '../auth/guards/driver-auth.guard';
import { TranslationModule } from '../translations/translations.module';
import { PlacesController, PlacesRateLimitGuard } from './places.controller';
import { PlacesService } from './places.service';

@Module({
  imports: [AuthModule, TranslationModule],
  controllers: [PlacesController],
  providers: [DriverAuthGuard, PlacesRateLimitGuard, PlacesService],
})
export class PlacesModule {}
