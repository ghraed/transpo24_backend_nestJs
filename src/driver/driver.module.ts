import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { PaymentsModule } from '../payments/payments.module';
import { PrismaService } from '../prisma/prisma.service';
import { TripsModule } from '../trips/trips.module';
import { DriverController } from './driver.controller';
import { DriverService } from './driver.service';

@Module({
  imports: [AuthModule, TripsModule, PaymentsModule],
  controllers: [DriverController],
  providers: [DriverService, PrismaService],
})
export class DriverModule {}
