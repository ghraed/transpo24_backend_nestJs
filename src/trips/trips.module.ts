import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { CustomerRequestsModule } from '../customer-requests/customer-requests.module';
import { PrismaService } from '../prisma/prisma.service';
import { CustomerTripsController, TripsController } from './trips.controller';
import { TripsGateway } from './trips.gateway';
import { TripsService } from './trips.service';

@Module({
  imports: [AuthModule, CustomerRequestsModule],
  controllers: [TripsController, CustomerTripsController],
  providers: [TripsService, TripsGateway, PrismaService],
  exports: [TripsService, TripsGateway],
})
export class TripsModule {}
