import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DriverAuthGuard } from '../auth/guards/driver-auth.guard';
import { CustomerAuthGuard } from '../auth/guards/customer-auth.guard';
import { TranslationModule } from '../translations/translations.module';
import {
  CustomerMapsPlacesController,
  PlacesController,
  PlacesRateLimitGuard,
} from './places.controller';
import { PlacesService } from './places.service';

@Module({
  imports: [AuthModule, TranslationModule],
  controllers: [PlacesController, CustomerMapsPlacesController],
  providers: [
    DriverAuthGuard,
    CustomerAuthGuard,
    PlacesRateLimitGuard,
    PlacesService,
  ],
})
export class PlacesModule {}
