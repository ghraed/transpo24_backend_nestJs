import { Module } from '@nestjs/common';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { CustomerRequestsModule } from './customer-requests/customer-requests.module';
import { DriverModule } from './driver/driver.module';
import { TripsModule } from './trips/trips.module';
import { ServicesModule } from './services/services.module';
import { VehiclesModule } from './vehicles/vehicles.module';

@Module({
  imports: [
    AuthModule,
    ServicesModule,
    CustomerRequestsModule,
    DriverModule,
    TripsModule,
    VehiclesModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
