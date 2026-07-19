import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AuthModule } from '../auth/auth.module';
import { CustomerRequestsModule } from '../customer-requests/customer-requests.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PrismaService } from '../prisma/prisma.service';
import { TripsModule } from '../trips/trips.module';
import { DriverPayoutQueueService } from './driver-payout-queue.service';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { StripeService } from './stripe.service';

@Module({
  imports: [
    ConfigModule,
    AuthModule,
    forwardRef(() => TripsModule),
    forwardRef(() => CustomerRequestsModule),
    NotificationsModule,
  ],
  controllers: [PaymentsController],
  providers: [
    PaymentsService,
    StripeService,
    PrismaService,
    DriverPayoutQueueService,
  ],
  exports: [PaymentsService, StripeService],
})
export class PaymentsModule {}
