import { Module, forwardRef } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { PaymentsModule } from '../payments/payments.module';
import { PrismaService } from '../prisma/prisma.service';
import { TripsModule } from '../trips/trips.module';
import { CustomerHomeController } from './customer-home.controller';
import { CustomerRequestsController } from './customer-requests.controller';
import { CustomerRequestsService } from './customer-requests.service';

@Module({
  imports: [AuthModule, PaymentsModule, forwardRef(() => TripsModule)],
  controllers: [CustomerHomeController, CustomerRequestsController],
  providers: [CustomerRequestsService, PrismaService],
  exports: [CustomerRequestsService],
})
export class CustomerRequestsModule {}
